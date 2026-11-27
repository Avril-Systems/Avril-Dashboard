import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireEntity } from './lib/authz';
import { isHarnessType } from './lib/harnessActivities';

/**
 * Intención estratégica y particulares por arnés (persistentes por sesión).
 *
 * - strategic: una por sesión (intención general definida por el usuario).
 * - harness: una por arnés; el orquestador las deriva y el usuario puede cambiarlas.
 *
 * Son texto breve (≤ 600 caracteres); no son órdenes de ejecución. Cada arnés decide
 * cómo cumplir la suya con sus herramientas.
 */

const SERVER_SECRET_ENV = 'CONVEX_SERVER_SECRET';
const MAX_INTENTION_CHARS = 600;

function requireServerSecret(serverSecret: string | undefined) {
  const expected = process.env[SERVER_SECRET_ENV];
  if (!expected || serverSecret !== expected) {
    throw new Error('Unauthorized: invalid or missing server secret.');
  }
}

function cleanBody(value: string | undefined): string {
  const body = (value ?? '').trim();
  if (!body) throw new Error('La intención no puede estar vacía.');
  if (body.length > MAX_INTENTION_CHARS) {
    throw new Error(`La intención debe tener ${MAX_INTENTION_CHARS} caracteres o menos.`);
  }
  return body;
}

async function findHarnessAgent(ctx: any, sessionId: any, harnessType: string) {
  const agents = await ctx.db
    .query('orchestrationAgents')
    .withIndex('by_session', (q: any) => q.eq('sessionId', sessionId))
    .collect();
  return (
    agents.find((agent: any) => {
      if (agent.agentKey === harnessType) return true;
      const meta = agent.meta;
      return Boolean(meta && typeof meta === 'object' && (meta as Record<string, unknown>).harnessType === harnessType);
    }) ?? null
  );
}

async function upsertIntention(
  ctx: any,
  session: { _id: any; organizationId: any },
  scope: 'strategic' | 'harness',
  harnessType: string | undefined,
  body: string,
  source: 'user' | 'orchestrator' | 'harness',
  updatedBy?: string
) {
  const now = new Date().toISOString();
  const existing =
    scope === 'strategic'
      ? await ctx.db
          .query('intentions')
          .withIndex('by_session_scope', (q: any) => q.eq('sessionId', session._id).eq('scope', 'strategic'))
          .first()
      : await ctx.db
          .query('intentions')
          .withIndex('by_session_harness', (q: any) =>
            q.eq('sessionId', session._id).eq('harnessType', harnessType)
          )
          .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      body,
      source,
      updatedBy: updatedBy?.slice(0, 80),
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert('intentions', {
    sessionId: session._id,
    organizationId: session.organizationId,
    scope,
    ...(harnessType ? { harnessType } : {}),
    body,
    source,
    updatedBy: updatedBy?.slice(0, 80),
    createdAt: now,
    updatedAt: now,
  });
}

function intentionsPublic(rows: Array<{ scope: string; harnessType?: string; body: string; updatedAt: string }>) {
  const strategic = rows.find((row) => row.scope === 'strategic');
  const harness: Record<string, string> = {};
  for (const row of rows) {
    if (row.scope === 'harness' && row.harnessType) harness[row.harnessType] = row.body;
  }
  return {
    strategic: strategic?.body ?? null,
    harness,
    updatedAt: strategic?.updatedAt ?? rows[0]?.updatedAt ?? null,
  };
}

/** Intenciones de una sesión (general + particulares). */
export const getIntentionsServer = query({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    const rows = await ctx.db
      .query('intentions')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();
    return intentionsPublic(rows);
  },
});

/**
 * Define/actualiza la intención general y, opcionalmente, varias particulares
 * en una sola operación (el orquestador las deriva juntas).
 */
export const setStrategyServer = mutation({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    strategic: v.optional(v.string()),
    harnessIntentions: v.optional(
      v.array(
        v.object({
          harnessType: v.string(),
          body: v.string(),
        })
      )
    ),
    source: v.union(v.literal('user'), v.literal('orchestrator'), v.literal('harness')),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const session = requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');

    const strategic = args.strategic !== undefined ? cleanBody(args.strategic) : undefined;
    const harnessEntries = (args.harnessIntentions ?? []).map((entry) => {
      if (!isHarnessType(entry.harnessType)) {
        throw new Error(`Arnés no válido: ${entry.harnessType}.`);
      }
      return { harnessType: entry.harnessType, body: cleanBody(entry.body) };
    });

    if (!strategic && harnessEntries.length === 0) {
      throw new Error('Nada que actualizar: falta strategic o harnessIntentions.');
    }

    // Validar agentes antes de escribir nada.
    for (const entry of harnessEntries) {
      const agent = await findHarnessAgent(ctx, session._id, entry.harnessType);
      if (!agent) throw new Error(`No hay agente para el arnés ${entry.harnessType} en esta sesión.`);
    }

    if (strategic) {
      await upsertIntention(ctx, session, 'strategic', undefined, strategic, args.source, args.updatedBy);
    }
    for (const entry of harnessEntries) {
      await upsertIntention(ctx, session, 'harness', entry.harnessType, entry.body, args.source, args.updatedBy);
    }

    const rows = await ctx.db
      .query('intentions')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .collect();
    return intentionsPublic(rows);
  },
});

/** Actualiza la intención de un arnés concreto (intervención directa). */
export const setHarnessIntentionServer = mutation({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    harnessType: v.string(),
    body: v.string(),
    source: v.union(v.literal('user'), v.literal('orchestrator'), v.literal('harness')),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const session = requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    if (!isHarnessType(args.harnessType)) throw new Error('Arnés no válido.');
    const body = cleanBody(args.body);

    const agent = await findHarnessAgent(ctx, session._id, args.harnessType);
    if (!agent) throw new Error(`No hay agente para el arnés ${args.harnessType} en esta sesión.`);

    await upsertIntention(ctx, session, 'harness', args.harnessType, body, args.source, args.updatedBy);
    return { harnessType: args.harnessType, body };
  },
});
