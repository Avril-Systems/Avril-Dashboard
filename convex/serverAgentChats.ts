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
