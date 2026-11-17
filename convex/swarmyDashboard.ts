/**
 * Swarmy S00 — API del Dashboard para usuarios autenticados (NO usa serverSecret).
 *
 * Por qué existe: todas las funciones de serverOrchestration.ts exigen CONVEX_SERVER_SECRET,
 * que jamás debe llegar al navegador. Estas funciones validan identidad + membresía de la
 * organización con lib/authz.ts, así que el frontend puede usarlas con useQuery/useMutation.
 *
 * No cambia schema.ts. Eventos y agentes los escribe el backend/Engine con las mutations *Server.
 *
 * Contrato de control (acordar con Alejandro/Engine):
 *   Dashboard escribe  : orchestrationEvents { type: 'agent.command.sent', payload: { agentKey, command: 'pause'|'kill', requestedBy, isMock:false } }
 *   Engine confirma con: 'agent.paused' | 'agent.stopped' (o 'agent.status') -> lo lee deriveRunControl().
 *   Solicitud != confirmación: esta mutation NUNCA marca el agente como pausado/detenido.
 */
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireEntity, requireOrgMembership } from './lib/authz';
import type { Role } from './lib/authz';

type Ctx = QueryCtx | MutationCtx;

/** Carga la sesión y verifica que el usuario pertenezca a SU organización (aislamiento por tenant). */
async function loadRunForMember(ctx: Ctx, sessionId: Id<'orchestrationSessions'>, minRole: Role) {
  const session = requireEntity(await ctx.db.get(sessionId), 'Run');
  const { user } = await requireOrgMembership(ctx, session.organizationId, minRole);
  return { session, user };
}

/** Lista de runs (workspace -> run). */
export const listRuns = query({
  args: { organizationId: v.id('organizations'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOrgMembership(ctx, args.organizationId, 'viewer');
    const take = Math.max(1, Math.min(args.limit ?? 50, 100));
    const sessions = await ctx.db
      .query('orchestrationSessions')
      .withIndex('by_org_updatedAt', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(take);
    return sessions.map((s) => ({
      _id: s._id,
      companyName: s.companyName ?? null,
      status: s.status,
      error: s.error ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
});

/**
 * Todo lo que necesita la pantalla de un run en UNA suscripción:
 * sesión + agentes + eventos (orden cronológico). Persistido en Convex: sobrevive refresh/reconexión.
 */
export const getRunOverview = query({
  args: { sessionId: v.id('orchestrationSessions'), eventLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { session } = await loadRunForMember(ctx, args.sessionId, 'viewer');

    const agents = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();

    const take = Math.max(1, Math.min(args.eventLimit ?? 200, 500));
    const latestFirst = await ctx.db
      .query('orchestrationEvents')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .order('desc')
      .take(take);

    return {
      runId: session._id, // runId = orchestrationSessions._id (PENDIENTE confirmar con Alejandro)
      session: {
        _id: session._id,
        companyName: session.companyName ?? null,
        status: session.status,
        error: session.error ?? null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      agents: agents
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((a) => ({
          _id: a._id,
          agentKey: a.agentKey,
          parentAgentKey: a.parentAgentKey ?? null,
          name: a.name,
          role: a.role ?? null,
          status: a.status,
          meta: a.meta ?? null,
          updatedAt: a.updatedAt,
        })),
      events: latestFirst.reverse().map((e) => ({
        _id: e._id,
        type: e.type,
        payload: e.payload ?? null,
        createdAt: e.createdAt,
      })),
    };
  },
});

/** Tareas de la organización. OJO: `tasks` no tiene sessionId, no están ligadas a un run. */
export const listTasks = query({
  args: { organizationId: v.id('organizations'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOrgMembership(ctx, args.organizationId, 'viewer');
    const take = Math.max(1, Math.min(args.limit ?? 100, 200));
    const rows = await ctx.db
      .query('tasks')
      .withIndex('by_org_status', (q) => q.eq('organizationId', args.organizationId))
      .take(take);
    return rows.map((t) => ({
      _id: t._id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assigneeAgentId: t.assigneeAgentId ?? null,
      createdAt: t.createdAt,
    }));
  },
});

/**
 * Solicita pausa/stop. Autenticado y autorizado EN EL SERVIDOR (rol operator o superior).
 * Solo registra la SOLICITUD (+ auditoría). No cambia ningún estado: la confirmación debe
 * llegar como evento del Engine.
 */
export const requestAgentControl = mutation({
  args: {
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
    command: v.union(v.literal('pause'), v.literal('kill')),
  },
  handler: async (ctx, args) => {
    const { session, user } = await loadRunForMember(ctx, args.sessionId, 'operator');

    if (session.status === 'failed' || session.status === 'completed') {
      throw new ConvexError({ code: 'conflict', message: `El run ya terminó (${session.status}).` });
    }

    const agent = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session_agentKey', (q) => q.eq('sessionId', args.sessionId).eq('agentKey', args.agentKey))
      .first();
    requireEntity(agent, 'Agent');

    const now = new Date().toISOString();
    const commandId = await ctx.db.insert('orchestrationEvents', {
      sessionId: args.sessionId,
      type: 'agent.command.sent',
      payload: { agentKey: args.agentKey, command: args.command, requestedBy: user._id, isMock: false },
      createdAt: now,
    });

    await ctx.db.insert('auditLogs', {
      organizationId: session.organizationId,
      actorUserId: user._id,
      action: `agent.${args.command}.requested`,
      resourceType: 'orchestrationSession',
      resourceId: args.sessionId,
      metadata: { agentKey: args.agentKey, commandEventId: commandId },
      createdAt: now,
    });

    return { commandId, sentAt: now };
  },
});
