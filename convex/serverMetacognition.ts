import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireEntity } from './lib/authz';

/**
 * Metacognition v0.1 — host storage (Convex).
 *
 * Independiente de intención, ejecución y trazabilidad de turnos. Solo guarda:
 *   - estado por agente (enabled, cadencia, cursor, lease),
 *   - lecciones privadas (histórico con retiro),
 *   - intentos de ciclo (running/success/skipped/failed).
 *
 * El host (Next) hace la inferencia y valida el JSON; este módulo solo persiste.
 */

const SERVER_SECRET_ENV = 'CONVEX_SERVER_SECRET';
const DEFAULT_CADENCE_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 90_000;
const MAX_ACTIVE_LESSONS = 20;
const MAX_LESSON_CHARS = 240;

function requireServerSecret(serverSecret: string | undefined) {
  const expected = process.env[SERVER_SECRET_ENV];
  if (!expected || serverSecret !== expected) {
    throw new Error('Unauthorized: invalid or missing server secret.');
  }
}

function requireSafeKey(value: string, field: string) {
  if (!value || value.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw new Error(`Identificador inválido para ${field}.`);
  }
}

function normalizeLesson(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function publicLesson(row: {
  _id: string;
  lesson: string;
  status: string;
  sourceCycleId: string;
  experienceRefs?: string[];
  createdAt: string;
}) {
  return {
    _id: row._id,
    lesson: row.lesson,
    status: row.status,
    sourceCycleId: row.sourceCycleId,
    experienceRefs: row.experienceRefs ?? [],
    createdAt: row.createdAt,
  };
}

async function stateFor(ctx: any, sessionId: any, agentKey: string) {
  return await ctx.db
    .query('metacognitionStates')
    .withIndex('by_session_agent', (q: any) => q.eq('sessionId', sessionId).eq('agentKey', agentKey))
    .first();
}

async function requireAgent(ctx: any, sessionId: any, agentKey: string) {
  requireSafeKey(agentKey, 'agentKey');
  const agent = await ctx.db
    .query('orchestrationAgents')
    .withIndex('by_session_agentKey', (q: any) => q.eq('sessionId', sessionId).eq('agentKey', agentKey))
    .first();
  if (!agent) throw new Error('Unknown agent for this session.');
  return agent;
}

/** Habilita/deshabilita metacognición para un agente (deshabilitada por defecto). */
export const enableMetacognitionServer = mutation({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
    enabled: v.boolean(),
    cadenceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const session = requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    await requireAgent(ctx, session._id, args.agentKey);

    const cadence = Math.min(
      7 * 24 * 60 * 60 * 1000,
      Math.max(1000, Math.trunc(args.cadenceMs ?? DEFAULT_CADENCE_MS))
    );
    const now = new Date().toISOString();
    const existing = await stateFor(ctx, session._id, args.agentKey);

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        cadenceMs: cadence,
        updatedAt: now,
      });
      return { enabled: args.enabled, cadenceMs: cadence };
    }

    await ctx.db.insert('metacognitionStates', {
      sessionId: session._id,
      agentKey: args.agentKey,
      organizationId: session.organizationId,
      enabled: args.enabled,
      cadenceMs: cadence,
      createdAt: now,
      updatedAt: now,
    });
    return { enabled: args.enabled, cadenceMs: cadence };
  },
});

/** Estados de metacognición de una sesión. */
export const listMetacognitionStatesServer = query({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    const rows = await ctx.db
      .query('metacognitionStates')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();
    return rows.map((row) => ({
      agentKey: row.agentKey,
      enabled: row.enabled,
      cadenceMs: row.cadenceMs,
      lastCycleAt: row.lastCycleAt ?? null,
      lastProcessedAt: row.lastProcessedAt ?? null,
      lastStatus: row.lastStatus ?? null,
      lastError: row.lastError ?? null,
      leaseOwner: row.leaseOwner ?? null,
      leaseExpiresAt: row.leaseExpiresAt ?? null,
    }));
  },
});

/** Lecciones activas (máximo 20 por agente). */
export const getMetacognitionLessonsServer = query({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');
    const rows = await ctx.db
      .query('metacognitionLessons')
      .withIndex('by_session_agent_created', (q) =>
        q.eq('sessionId', args.sessionId).eq('agentKey', args.agentKey)
      )
      .order('desc')
      .take(MAX_ACTIVE_LESSONS * 2);
    return rows
      .filter((row) => !row.retiredAt)
      .slice(0, MAX_ACTIVE_LESSONS)
      .map((row) => publicLesson(row));
  },
});

/**
 * Reclama un ciclo: verifica habilitado/cadencia/lease y crea el intento.
 * Devuelve el cursor (última experiencia procesada) y el cycleId.
 */
export const claimMetacognitionCycleServer = mutation({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
    leaseOwner: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.leaseOwner, 'leaseOwner');
    await requireAgent(ctx, args.sessionId, args.agentKey);

    const state = await stateFor(ctx, args.sessionId, args.agentKey);
    if (!state || !state.enabled) return { ok: false as const, reason: 'disabled' as const };

    const now = Date.now();
    if (state.leaseExpiresAt && state.leaseExpiresAt > now) {
      return { ok: false as const, reason: 'leased' as const };
    }
    if (state.lastCycleAt) {
      const last = Date.parse(state.lastCycleAt);
      if (Number.isFinite(last) && now - last < state.cadenceMs) {
        return { ok: false as const, reason: 'not_due' as const };
      }
    }

    const nowIso = new Date(now).toISOString();
    const cycleId = await ctx.db.insert('metacognitionCycles', {
      sessionId: args.sessionId,
      agentKey: args.agentKey,
      organizationId: state.organizationId,
      status: 'running',
      inferenceCalls: 0,
      inputCount: 0,
      createdAt: nowIso,
    });
    await ctx.db.patch(state._id, {
      leaseOwner: args.leaseOwner,
      leaseExpiresAt: now + LEASE_MS,
      updatedAt: nowIso,
    });

    return {
      ok: true as const,
      cycleId,
      cursor: state.lastProcessedAt ?? null,
      cadenceMs: state.cadenceMs,
    };
  },
});

/** Experiencia elegible: mensajes del chat del agente, más antiguos primero. */
export const listMetacognitionExperienceServer = query({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
    since: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');

    const chat = await ctx.db
      .query('chats')
      .withIndex('by_session_agent', (q) =>
        q.eq('orchestrationSessionId', args.sessionId).eq('agentKey', args.agentKey)
      )
      .first();
    if (!chat || chat.kind !== 'agent') return [];

    const take = Math.max(1, Math.min(Math.trunc(args.limit ?? 12), 12));
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_chat_createdAt', (q) =>
        q.eq('chatId', chat._id).gt('createdAt', args.since ?? '')
      )
      .order('asc')
      .take(take);

    return messages.map((message) => ({
      _id: message._id,
      role: message.authorType,
      authorId: message.authorId,
      content: message.content.slice(0, 500),
      createdAt: message.createdAt,
    }));
  },
});

/** Sin experiencia nueva: cierra el intento sin inferencia y respeta cadencia. */
export const skipMetacognitionCycleServer = mutation({
  args: {
    serverSecret: v.string(),
    cycleId: v.id('metacognitionCycles'),
    leaseOwner: v.string(),
    inputCount: v.number(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const cycle = requireEntity(await ctx.db.get(args.cycleId), 'Metacognition cycle');
    if (cycle.status !== 'running') return { ok: false as const, reason: 'not_running' as const };

    const state = await stateFor(ctx, cycle.sessionId, cycle.agentKey);
    if (!state || state.leaseOwner !== args.leaseOwner) {
      return { ok: false as const, reason: 'not_owner' as const };
    }
    const now = Date.now();
    if (state.leaseExpiresAt && state.leaseExpiresAt <= now) {
      return { ok: false as const, reason: 'lease_expired' as const };
    }

    const nowIso = new Date(now).toISOString();
    await ctx.db.patch(cycle._id, {
      status: 'skipped',
      inferenceCalls: 0,
      inputCount: args.inputCount,
      finishedAt: nowIso,
    });
    await ctx.db.patch(state._id, {
      lastCycleAt: nowIso,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastStatus: 'skipped',
      updatedAt: nowIso,
    });
    return { ok: true as const };
  },
});

/**
 * Success: guarda lecciones validadas + cursor de forma atómica.
 * Rechaza writers con lease expirado o que no son dueños.
 */
export const completeMetacognitionCycleServer = mutation({
  args: {
    serverSecret: v.string(),
    cycleId: v.id('metacognitionCycles'),
    leaseOwner: v.string(),
    lessons: v.array(
      v.object({
        lesson: v.string(),
        status: v.union(v.literal('tentative'), v.literal('observed')),
        experienceRefs: v.optional(v.array(v.string())),
      })
    ),
    cursorAfter: v.string(),
    inputCount: v.number(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const cycle = requireEntity(await ctx.db.get(args.cycleId), 'Metacognition cycle');
    if (cycle.status !== 'running') return { ok: false as const, reason: 'not_running' as const };

    const state = await stateFor(ctx, cycle.sessionId, cycle.agentKey);
    if (!state || state.leaseOwner !== args.leaseOwner) {
      return { ok: false as const, reason: 'not_owner' as const };
    }
    const now = Date.now();
    if (state.leaseExpiresAt && state.leaseExpiresAt <= now) {
      return { ok: false as const, reason: 'lease_expired' as const };
    }
    if (args.lessons.length > 3) {
      return { ok: false as const, reason: 'too_many_lessons' as const };
    }

    const active = await ctx.db
      .query('metacognitionLessons')
      .withIndex('by_session_agent_created', (q) =>
        q.eq('sessionId', cycle.sessionId).eq('agentKey', cycle.agentKey)
      )
      .order('asc')
      .collect();
    const activeRows = active.filter((row) => !row.retiredAt);
    const seen = new Set(activeRows.map((row) => normalizeLesson(row.lesson)));
    const nowIso = new Date(now).toISOString();
    let added = 0;

    for (const lesson of args.lessons) {
      const text = lesson.lesson.trim();
      if (!text || text.length > MAX_LESSON_CHARS) {
        return { ok: false as const, reason: 'invalid_lesson' as const };
      }
      const key = normalizeLesson(text);
      if (seen.has(key)) continue;
      seen.add(key);
      await ctx.db.insert('metacognitionLessons', {
        sessionId: cycle.sessionId,
        agentKey: cycle.agentKey,
        organizationId: cycle.organizationId,
        lesson: text,
        status: lesson.status,
        sourceCycleId: cycle._id,
        experienceRefs: lesson.experienceRefs?.slice(0, 3),
        createdAt: nowIso,
      });
      added += 1;
    }

    const after = await ctx.db
      .query('metacognitionLessons')
      .withIndex('by_session_agent_created', (q) =>
        q.eq('sessionId', cycle.sessionId).eq('agentKey', cycle.agentKey)
      )
      .order('asc')
      .collect();
    const stillActive = after.filter((row) => !row.retiredAt);
    const excess = stillActive.length - MAX_ACTIVE_LESSONS;
    for (let i = 0; i < excess; i++) {
      await ctx.db.patch(stillActive[i]._id, { retiredAt: nowIso });
    }

    await ctx.db.patch(cycle._id, {
      status: 'success',
      inferenceCalls: 1,
      inputCount: args.inputCount,
      cursorAfter: args.cursorAfter,
      model: args.model?.slice(0, 80),
      finishedAt: nowIso,
    });
    await ctx.db.patch(state._id, {
      lastCycleAt: nowIso,
      lastProcessedAt: args.cursorAfter,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastStatus: 'success',
      lastError: undefined,
      updatedAt: nowIso,
    });

    return { ok: true as const, added, active: stillActive.length };
  },
});

/** Fallo (timeout, proveedor, JSON inválido): no mueve cursor ni lecciones. */
export const failMetacognitionCycleServer = mutation({
  args: {
    serverSecret: v.string(),
    cycleId: v.id('metacognitionCycles'),
    leaseOwner: v.string(),
    error: v.string(),
    inferenceCalls: v.number(),
    inputCount: v.number(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const cycle = requireEntity(await ctx.db.get(args.cycleId), 'Metacognition cycle');
    if (cycle.status !== 'running') return { ok: false as const, reason: 'not_running' as const };

    const state = await stateFor(ctx, cycle.sessionId, cycle.agentKey);
    if (!state || state.leaseOwner !== args.leaseOwner) {
      return { ok: false as const, reason: 'not_owner' as const };
    }
    const now = Date.now();
    if (state.leaseExpiresAt && state.leaseExpiresAt <= now) {
      return { ok: false as const, reason: 'lease_expired' as const };
    }

    const nowIso = new Date(now).toISOString();
    await ctx.db.patch(cycle._id, {
      status: 'failed',
      inferenceCalls: args.inferenceCalls,
      inputCount: args.inputCount,
      error: args.error.slice(0, 500),
      finishedAt: nowIso,
    });
    await ctx.db.patch(state._id, {
      lastCycleAt: nowIso,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastStatus: 'failed',
      lastError: args.error.slice(0, 500),
      updatedAt: nowIso,
    });
    return { ok: true as const };
  },
});


/** Intentos de ciclo recientes (observabilidad del host). */
export const listMetacognitionCyclesServer = query({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');
    const take = Math.max(1, Math.min(Math.trunc(args.limit ?? 10), 50));
    const rows = await ctx.db
      .query('metacognitionCycles')
      .withIndex('by_session_agent', (q) =>
        q.eq('sessionId', args.sessionId).eq('agentKey', args.agentKey)
      )
      .order('desc')
      .take(take);
    return rows.map((row) => ({
      _id: row._id,
      status: row.status,
      inferenceCalls: row.inferenceCalls,
      inputCount: row.inputCount,
      cursorAfter: row.cursorAfter ?? null,
      model: row.model ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt ?? null,
    }));
  },
});
