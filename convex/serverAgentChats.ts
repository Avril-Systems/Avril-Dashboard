import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireEntity } from './lib/authz';

/**
 * Conversaciones por agente (S01).
 *
 * Cada agente del Agent Office (identificado por `orchestrationAgents.agentKey`
 * dentro de una sesión) tiene su propio chat 1:1 en la tabla `chats`:
 *   kind='agent', orchestrationSessionId=<session>, agentKey=<agentKey>.
 *
 * El chat NO reutiliza el hilo del fundador (ese sigue siendo kind='architect')
 * y NO crea filas en `agents` (esa tabla es el registro de workers por chat).
 * La identidad del agente sale siempre de `orchestrationAgents`, validada aquí
 * en el servidor: el cliente no puede inventar un agentKey ajeno a la sesión.
 */

const SERVER_SECRET_ENV = 'CONVEX_SERVER_SECRET';

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

const agentSnapshot = (agent: {
  agentKey: string;
  name: string;
  role?: string;
  meta?: unknown;
}) => ({
  agentKey: agent.agentKey,
  name: agent.name,
  role: agent.role ?? null,
  meta: agent.meta ?? null,
});

/** Chat existente del agente (o null). Devuelve también la identidad canónica del agente. */
export const getAgentChatServer = query({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');

    const agent = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session_agentKey', (q) => q.eq('sessionId', args.sessionId).eq('agentKey', args.agentKey))
      .first();
    if (!agent) return null;

    const chat = await ctx.db
      .query('chats')
      .withIndex('by_session_agent', (q) =>
        q.eq('orchestrationSessionId', args.sessionId).eq('agentKey', args.agentKey),
      )
      .first();

    return {
      chatId: chat?._id ?? null,
      agent: agentSnapshot(agent),
    };
  },
});

/**
 * Devuelve el chat del agente, creándolo la primera vez.
 * Un chat por (sessionId, agentKey): la conversación sobrevive a recargas y
 * reconexiones porque vive en Convex, no en el estado del componente.
 */
export const getOrCreateAgentChatServer = mutation({
  args: {
    serverSecret: v.string(),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');
    const session = requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');

    const agent = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session_agentKey', (q) => q.eq('sessionId', args.sessionId).eq('agentKey', args.agentKey))
      .first();
    if (!agent) throw new Error('Unknown agent for this session.');

    const existing = await ctx.db
      .query('chats')
      .withIndex('by_session_agent', (q) =>
        q.eq('orchestrationSessionId', args.sessionId).eq('agentKey', args.agentKey),
      )
      .first();
    if (existing) {
      return { chatId: existing._id, agent: agentSnapshot(agent) };
    }

    const now = new Date().toISOString();
    const title = `${agent.name}${agent.role ? ` · ${agent.role}` : ''}`.slice(0, 120);
    const chatId = await ctx.db.insert('chats', {
      organizationId: session.organizationId,
      title: title || agent.agentKey,
      kind: 'agent',
      orchestrationSessionId: args.sessionId,
      agentKey: agent.agentKey,
      createdAt: now,
      updatedAt: now,
    });

    return { chatId, agent: agentSnapshot(agent) };
  },
});

/**
 * Traza de tools del orquestador (S03). Se escribe SIEMPRE en servidor, después de
 * ejecutar (o de proponer) una tool, para que la conversación sea auditable tras
 * una recarga y se pueda enlazar el run creado.
 */
export const recordAgentToolCallServer = mutation({
  args: {
    serverSecret: v.string(),
    chatId: v.id('chats'),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
    tool: v.string(),
    args: v.any(),
    ok: v.boolean(),
    error: v.optional(v.string()),
    runId: v.optional(v.string()),
    activityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');
    requireSafeKey(args.tool, 'tool');

    const chat = requireEntity(await ctx.db.get(args.chatId), 'Chat');
    if (chat.orchestrationSessionId !== args.sessionId || chat.kind !== 'agent') {
      throw new Error('El chat no corresponde a la sesión/agente indicados.');
    }

    return await ctx.db.insert('agentToolCalls', {
      chatId: args.chatId,
      sessionId: args.sessionId,
      agentKey: args.agentKey,
      tool: args.tool,
      args: args.args ?? {},
      ok: args.ok,
      error: args.error?.slice(0, 500),
      runId: args.runId?.slice(0, 128),
      activityId: args.activityId?.slice(0, 128),
      createdAt: new Date().toISOString(),
    });
  },
});

const toolCallPublic = (row: {
  _id: string;
  tool: string;
  args: unknown;
  ok: boolean;
  error?: string;
  runId?: string;
  activityId?: string;
  createdAt: string;
}) => ({
  _id: row._id,
  tool: row.tool,
  args: row.args,
  ok: row.ok,
  error: row.error ?? null,
  runId: row.runId ?? null,
  activityId: row.activityId ?? null,
  createdAt: row.createdAt,
});

/** Últimas tools de un chat de agente (para pintar la traza persistida). */
export const listAgentToolCallsServer = query({
  args: {
    serverSecret: v.string(),
    chatId: v.id('chats'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.chatId), 'Chat');

    const take = Math.max(1, Math.min(args.limit ?? 20, 50));
    const rows = await ctx.db
      .query('agentToolCalls')
      .withIndex('by_chat', (q) => q.eq('chatId', args.chatId))
      .order('desc')
      .take(take);

    return rows.map(toolCallPublic);
  },
});

/**
 * Propuestas de ejecución (punto 2).
 * Una propuesta se persiste con su chat/sesión/organización/agente. La confirmación
 * llega por `proposalId`; el claim (mutación) es atómico y solo una confirmación
 * puede pasar de `pending` a `executing`. Así no hay ejecuciones duplicadas.
 */

const PROPOSAL_TTL_MS = 15 * 60 * 1000;

function proposalPublic(row: {
  _id: string;
  tool: string;
  args: unknown;
  summary: string;
  status: string;
  result?: unknown;
  error?: string;
  createdAt: string;
  expiresAt: number;
}) {
  return {
    _id: row._id,
    tool: row.tool,
    args: row.args,
    summary: row.summary,
    status: row.status,
    result: row.result ?? null,
    error: row.error ?? null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/** Persiste una propuesta de escritura. La crea el servidor tras validar el chat. */
export const createAgentToolProposalServer = mutation({
  args: {
    serverSecret: v.string(),
    chatId: v.id('chats'),
    agentKey: v.string(),
    tool: v.string(),
    args: v.any(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');
    requireSafeKey(args.tool, 'tool');

    const chat = requireEntity(await ctx.db.get(args.chatId), 'Chat');
    if (chat.kind !== 'agent' || !chat.orchestrationSessionId) {
      throw new Error('El chat no es una conversación de agente.');
    }

    const session = requireEntity(await ctx.db.get(chat.orchestrationSessionId), 'Orchestration session');
    if (chat.organizationId && chat.organizationId !== session.organizationId) {
      throw new Error('El chat no pertenece a la organización de la sesión.');
    }
    const agent = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session_agentKey', (q) =>
        q.eq('sessionId', chat.orchestrationSessionId as NonNullable<typeof chat.orchestrationSessionId>).eq('agentKey', args.agentKey)
      )
      .first();
    if (!agent) throw new Error('Unknown agent for this session.');

    const now = Date.now();
    const expiresAt = now + PROPOSAL_TTL_MS;
    const proposalId = await ctx.db.insert('agentToolProposals', {
      chatId: args.chatId,
      sessionId: session._id,
      organizationId: session.organizationId,
      agentKey: args.agentKey,
      tool: args.tool,
      args: args.args ?? {},
      summary: args.summary.slice(0, 500),
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });

    return { proposalId, expiresAt };
  },
});

/**
 * Consume una propuesta: pending -> executing. Si dos confirmaciones compiten,
 * Convex serializa y solo una ve `pending`; la otra recibe el estado actual.
 */
export const claimAgentToolProposalServer = mutation({
  args: {
    serverSecret: v.string(),
    proposalId: v.id('agentToolProposals'),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return { ok: false as const, reason: 'not_found' as const };

    if (proposal.status !== 'pending') {
      return { ok: false as const, reason: 'not_pending' as const, status: proposal.status };
    }

    const now = Date.now();
    if (proposal.expiresAt <= now) {
      await ctx.db.patch(proposal._id, {
        status: 'expired',
        finishedAt: new Date(now).toISOString(),
      });
      return { ok: false as const, reason: 'expired' as const, status: 'expired' as const };
    }

    if (proposal.sessionId !== args.sessionId || proposal.agentKey !== args.agentKey) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    const chat = requireEntity(await ctx.db.get(proposal.chatId), 'Chat');
    if (
      chat.kind !== 'agent' ||
      chat.orchestrationSessionId !== proposal.sessionId ||
      (chat.organizationId && chat.organizationId !== proposal.organizationId)
    ) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    const session = requireEntity(await ctx.db.get(proposal.sessionId), 'Orchestration session');
    if (session.organizationId !== proposal.organizationId) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    const agent = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session_agentKey', (q) =>
        q.eq('sessionId', proposal.sessionId).eq('agentKey', proposal.agentKey)
      )
      .first();
    if (!agent) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    const claimedAt = new Date(now).toISOString();
    await ctx.db.patch(proposal._id, { status: 'executing', claimedAt });

    return {
      ok: true as const,
      proposal: {
        _id: proposal._id,
        chatId: proposal.chatId,
        sessionId: proposal.sessionId,
        organizationId: proposal.organizationId,
        agentKey: proposal.agentKey,
        tool: proposal.tool,
        args: proposal.args,
        summary: proposal.summary,
      },
    };
  },
});

/** Cierra el claim. Solo se puede cerrar una propuesta en `executing`. */
export const finishAgentToolProposalServer = mutation({
  args: {
    serverSecret: v.string(),
    proposalId: v.id('agentToolProposals'),
    status: v.union(v.literal('executed'), v.literal('failed')),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const proposal = requireEntity(await ctx.db.get(args.proposalId), 'Proposal');
    if (proposal.status !== 'executing') {
      return { ok: false as const, reason: 'not_executing' as const, status: proposal.status };
    }

    await ctx.db.patch(proposal._id, {
      status: args.status,
      ...(args.result !== undefined ? { result: args.result } : {}),
      ...(args.error ? { error: args.error.slice(0, 500) } : {}),
      finishedAt: new Date().toISOString(),
    });

    return { ok: true as const, status: args.status };
  },
});

/** Cancela una propuesta pendiente (no toca las ya reclamadas/ejecutadas). */
export const cancelAgentToolProposalServer = mutation({
  args: {
    serverSecret: v.string(),
    proposalId: v.id('agentToolProposals'),
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireSafeKey(args.agentKey, 'agentKey');

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return { ok: false as const, reason: 'not_found' as const };
    if (proposal.status !== 'pending') {
      return { ok: false as const, reason: 'not_pending' as const, status: proposal.status };
    }
    if (proposal.sessionId !== args.sessionId || proposal.agentKey !== args.agentKey) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    const now = Date.now();
    if (proposal.expiresAt <= now) {
      await ctx.db.patch(proposal._id, {
        status: 'expired',
        finishedAt: new Date(now).toISOString(),
      });
      return { ok: false as const, reason: 'expired' as const, status: 'expired' as const };
    }

    const chat = requireEntity(await ctx.db.get(proposal.chatId), 'Chat');
    if (
      chat.kind !== 'agent' ||
      chat.orchestrationSessionId !== proposal.sessionId ||
      (chat.organizationId && chat.organizationId !== proposal.organizationId)
    ) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    const session = requireEntity(await ctx.db.get(proposal.sessionId), 'Orchestration session');
    if (session.organizationId !== proposal.organizationId) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    const agent = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session_agentKey', (q) =>
        q.eq('sessionId', proposal.sessionId).eq('agentKey', proposal.agentKey)
      )
      .first();
    if (!agent) {
      return { ok: false as const, reason: 'mismatch' as const, status: proposal.status };
    }

    await ctx.db.patch(proposal._id, {
      status: 'cancelled',
      finishedAt: new Date(now).toISOString(),
    });
    return { ok: true as const, status: 'cancelled' as const };
  },
});

/** Propuestas de un chat (por defecto las pendientes vigentes). */
export const listAgentToolProposalsServer = query({
  args: {
    serverSecret: v.string(),
    chatId: v.id('chats'),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.chatId), 'Chat');

    const take = Math.max(1, Math.min(args.limit ?? 20, 50));
    const rows = await ctx.db
      .query('agentToolProposals')
      .withIndex('by_chat', (q) => q.eq('chatId', args.chatId))
      .order('desc')
      .take(take);

    const now = Date.now();
    return rows
      .filter((row) => (args.status ? row.status === args.status : true))
      .filter((row) => (row.status !== 'pending' || row.expiresAt > now))
      .map(proposalPublic);
  },
});
