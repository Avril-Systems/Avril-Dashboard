import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireEntity } from './lib/authz';
import { deriveCompanyDisplayName, isPlaceholderChatTitle } from './lib/companyDisplayName';


const SERVER_SECRET_ENV = 'CONVEX_SERVER_SECRET';

function requireServerSecret(serverSecret: string | undefined) {
  const expected = process.env[SERVER_SECRET_ENV];
  if (!expected || serverSecret !== expected) {
    throw new Error('Unauthorized: invalid or missing server secret.');
  }
}

const orchestrationStatusValidator = v.union(
  v.literal('queued'),
  v.literal('spawning'),
  v.literal('active'),
  v.literal('failed'),
  v.literal('completed')
);

const orchestrationAgentStatusValidator = v.union(
  v.literal('spawning'),
  v.literal('idle'),
  v.literal('working'),
  v.literal('blocked'),
  v.literal('completed'),
  v.literal('error')
);

const orchestrationAgentInputValidator = v.object({
  agentKey: v.string(),
  parentAgentKey: v.optional(v.string()),
  name: v.string(),
  role: v.optional(v.string()),
  status: orchestrationAgentStatusValidator,
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  meta: v.optional(v.any()),
});

export const createSessionServer = mutation({
  args: {
    organizationId: v.id('organizations'),
    chatId: v.id('chats'),
    serverSecret: v.string(),
    companyName: v.optional(v.string()),
    status: v.optional(orchestrationStatusValidator),
    spawnRequestId: v.optional(v.string()),
    vpsRef: v.optional(v.string()),
    containerRef: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const chat = requireEntity(await ctx.db.get(args.chatId), 'Chat');
    requireEntity(await ctx.db.get(args.organizationId), 'Organization');

    const draft = await ctx.db
      .query('chatIgnitionDrafts')
      .withIndex('by_chat', (q) => q.eq('chatId', args.chatId))
      .first();

    const companyName = deriveCompanyDisplayName({
      companyName: args.companyName,
      chatTitle: chat.title,
      captured: draft?.captured,
      ignitionPrompt: draft?.ignitionPrompt,
      handoffPayload: draft?.handoffPayload,
    });

    if (isPlaceholderChatTitle(chat.title) && companyName !== 'Untitled company') {
      await ctx.db.patch(args.chatId, {
        title: companyName,
        updatedAt: new Date().toISOString(),
      });
    }

    const now = new Date().toISOString();
    return await ctx.db.insert('orchestrationSessions', {
      organizationId: args.organizationId,
      chatId: args.chatId,
      companyName,
      status: args.status ?? 'queued',
      spawnRequestId: args.spawnRequestId,
      vpsRef: args.vpsRef,
      containerRef: args.containerRef,
      error: args.error,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setSessionStatusServer = mutation({
  args: {
    sessionId: v.id('orchestrationSessions'),
    status: orchestrationStatusValidator,
    serverSecret: v.string(),
    spawnRequestId: v.optional(v.string()),
    vpsRef: v.optional(v.string()),
    containerRef: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');

    await ctx.db.patch(args.sessionId, {
      status: args.status,
      spawnRequestId: args.spawnRequestId,
      vpsRef: args.vpsRef,
      containerRef: args.containerRef,
      error: args.error,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const appendSessionEventServer = mutation({
  args: {
    sessionId: v.id('orchestrationSessions'),
    type: v.string(),
    payload: v.optional(v.any()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    return await ctx.db.insert('orchestrationEvents', {
      sessionId: args.sessionId,
      type: args.type,
      payload: args.payload,
      createdAt: new Date().toISOString(),
    });
  },
});

export const upsertAgentsSnapshotServer = mutation({
  args: {
    sessionId: v.id('orchestrationSessions'),
    agents: v.array(orchestrationAgentInputValidator),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();
    const existingByKey = new Map(existing.map((a) => [a.agentKey, a]));

    for (const agent of args.agents) {
      const match = existingByKey.get(agent.agentKey);
      if (match) {
        await ctx.db.patch(match._id, {
          parentAgentKey: agent.parentAgentKey,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          x: agent.x,
          y: agent.y,
          meta: agent.meta,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert('orchestrationAgents', {
          sessionId: args.sessionId,
          agentKey: agent.agentKey,
          parentAgentKey: agent.parentAgentKey,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          x: agent.x,
          y: agent.y,
          meta: agent.meta,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

export const updateAgentStatusServer = mutation({
  args: {
    sessionId: v.id('orchestrationSessions'),
    agentKey: v.string(),
    status: orchestrationAgentStatusValidator,
    serverSecret: v.string(),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    parentAgentKey: v.optional(v.string()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session_agentKey', (q) => q.eq('sessionId', args.sessionId).eq('agentKey', args.agentKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.role !== undefined ? { role: args.role } : {}),
        ...(args.parentAgentKey !== undefined ? { parentAgentKey: args.parentAgentKey } : {}),
        ...(args.meta !== undefined ? { meta: args.meta } : {}),
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('orchestrationAgents', {
      sessionId: args.sessionId,
      agentKey: args.agentKey,
      parentAgentKey: args.parentAgentKey,
      name: args.name ?? args.agentKey,
      role: args.role,
      status: args.status,
      meta: args.meta,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getSessionServer = query({
  args: {
    sessionId: v.id('orchestrationSessions'),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const session = requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    const chat = await ctx.db.get(session.chatId);
    const draft = await ctx.db
      .query('chatIgnitionDrafts')
      .withIndex('by_chat', (q) => q.eq('chatId', session.chatId))
      .first();
    const companyName = deriveCompanyDisplayName({
      companyName: session.companyName,
      chatTitle: chat?.title,
      captured: draft?.captured,
      ignitionPrompt: draft?.ignitionPrompt,
      handoffPayload: draft?.handoffPayload,
    });
    return {
      ...session,
      companyName,
      chatTitle: companyName,
    };
  },
});

export const getSessionByChatServer = query({
  args: {
    chatId: v.id('chats'),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const sessions = await ctx.db
      .query('orchestrationSessions')
      .withIndex('by_chat', (q) => q.eq('chatId', args.chatId))
      .collect();
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  },
});

export const listSessionAgentsServer = query({
  args: {
    sessionId: v.id('orchestrationSessions'),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');
    const agents = await ctx.db
      .query('orchestrationAgents')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .collect();
    return agents.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
});

export const listSessionEventsServer = query({
  args: {
    sessionId: v.id('orchestrationSessions'),
    serverSecret: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.sessionId), 'Orchestration session');

    const take = Math.max(1, Math.min(args.limit ?? 100, 500));
    const events = await ctx.db
      .query('orchestrationEvents')
      .withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
      .order('desc')
      .take(take);
    return events.reverse();
  },
});

/** Recent office/company sessions for an org (resume UI). */
export const listSessionsByOrgServer = query({
  args: {
    organizationId: v.id('organizations'),
    serverSecret: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.organizationId), 'Organization');

    const take = Math.max(1, Math.min(args.limit ?? 50, 100));
    const sessions = await ctx.db
      .query('orchestrationSessions')
      .withIndex('by_org_updatedAt', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(take);

    const enriched = [];
    for (const session of sessions) {
      const chat = await ctx.db.get(session.chatId);
      const draft = await ctx.db
        .query('chatIgnitionDrafts')
        .withIndex('by_chat', (q) => q.eq('chatId', session.chatId))
        .first();
      const agents = await ctx.db
        .query('orchestrationAgents')
        .withIndex('by_session', (q) => q.eq('sessionId', session._id))
        .collect();
      const companyName = deriveCompanyDisplayName({
        companyName: session.companyName,
        chatTitle: chat?.title,
        captured: draft?.captured,
        ignitionPrompt: draft?.ignitionPrompt,
        handoffPayload: draft?.handoffPayload,
      });
      enriched.push({
        ...session,
        companyName,
        chatTitle: companyName,
        agentCount: agents.length,
      });
    }
    return enriched;
  },
});

/** Rewrite stored "# Agent brief …" labels using draft/chat idea text. */
export const healSessionDisplayNamesServer = mutation({
  args: {
    organizationId: v.id('organizations'),
    serverSecret: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.organizationId), 'Organization');

    const take = Math.max(1, Math.min(args.limit ?? 100, 200));
    const sessions = await ctx.db
      .query('orchestrationSessions')
      .withIndex('by_org_updatedAt', (q) => q.eq('organizationId', args.organizationId))
      .order('desc')
      .take(take);

    let healed = 0;
    const now = new Date().toISOString();

    for (const session of sessions) {
      if (!isPlaceholderChatTitle(session.companyName)) continue;

      const chat = await ctx.db.get(session.chatId);
      const draft = await ctx.db
        .query('chatIgnitionDrafts')
        .withIndex('by_chat', (q) => q.eq('chatId', session.chatId))
        .first();

      const companyName = deriveCompanyDisplayName({
        companyName: undefined,
        chatTitle: chat?.title,
        captured: draft?.captured,
        ignitionPrompt: draft?.ignitionPrompt,
        handoffPayload: draft?.handoffPayload,
      });

      if (companyName === 'Untitled company' || companyName === (session.companyName ?? '').trim()) {
        continue;
      }

      await ctx.db.patch(session._id, { companyName, updatedAt: now });
      if (chat && isPlaceholderChatTitle(chat.title)) {
        await ctx.db.patch(chat._id, { title: companyName, updatedAt: now });
      }
      healed += 1;
    }

    return { healed, scanned: sessions.length };
  },
});

  // --- Mutación autenticada para Ingestión de Eventos (S00 / W46) ---
export const ingestEvent = mutation({
  args: {
    serverSecret: v.string(),
    version: v.string(),
    tenantId: v.string(),
    workspaceId: v.string(),
    runId: v.string(),
    eventType: v.union(
      v.literal("support.report.received"),
      v.literal("handoff.created"),
      v.literal("handoff.ack"),
      v.literal("diagnosis.ready"),
      v.literal("patch.proposed"),
      v.literal("approval.decided"),
      v.literal("run.result"),
      v.literal("run.pause"),
      v.literal("run.pause.confirmed"),
      v.literal("error.reported"),
      v.literal("agent.command.sent"),
      v.literal("agent.status"),
      v.literal("agent.paused"),
      v.literal("agent.stopped")
    ),
    payload: v.any(),
    idempotencyKey: v.string(),

    // Trazabilidad de código y DeepSeek
    repository: v.optional(v.string()),
    branch: v.optional(v.string()),
    allowedRoutes: v.optional(v.array(v.string())),
    patchRef: v.optional(v.string()),
    testResultRef: v.optional(v.string()),
    prRef: v.optional(v.string()),
    humanApprovalRequired: v.boolean(),
  },
  handler: async (ctx, args) => {
    // 1. Denegar acceso anónimo o secreto inválido
    requireServerSecret(args.serverSecret);

    // 2. Verificación de Idempotencia POR TENANT
    const existingEvent = await ctx.db
      .query("orchestratorEvents")
      .withIndex("by_tenant_idempotency", (q) =>
        q.eq("tenantId", args.tenantId).eq("idempotencyKey", args.idempotencyKey)
      )
      .first();

    if (existingEvent) {
      return {
        status: "idempotent_hit" as const,
        eventId: existingEvent._id,
        message: "Evento ignorado: Ya fue registrado previamente para este tenant.",
      };
    }

    // 3. Extraemos serverSecret para NO persistirlo nunca en la base de datos
    const { serverSecret: _secret, ...eventData } = args;
    const timestamp = Date.now();

    const eventId = await ctx.db.insert("orchestratorEvents", {
      ...eventData,
      ack: true,
      timestamp,
    });

    return {
      status: "success" as const,
      eventId,
    };
  },
});

// Consulta autenticada por tenant y runId (formato compatible con EventItem de Kevin)
export const getEventsByRun = query({
  args: {
    serverSecret: v.string(),
    tenantId: v.string(),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);

    const events = await ctx.db
      .query("orchestratorEvents")
      .withIndex("by_tenant_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", args.runId)
      )
      .collect();

    return events
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((ev) => ({
        _id: ev._id,
        type: ev.eventType,
        createdAt: new Date(ev.timestamp).toISOString(),
        payload: ev.payload,
        runId: ev.runId,
        version: ev.version,
        patchRef: ev.patchRef,
        prRef: ev.prRef,
      }));
  },
});

// Consulta autenticada de eventos recientes por tenant (para refresh del Dashboard)
export const listEventsByTenant = query({
  args: {
    serverSecret: v.string(),
    tenantId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);

    const take = Math.max(1, Math.min(args.limit ?? 100, 500));
    const events = await ctx.db
      .query("orchestratorEvents")
      .withIndex("by_tenant_time", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(take);

    return events.reverse().map((ev) => ({
      _id: ev._id,
      type: ev.eventType,
      createdAt: new Date(ev.timestamp).toISOString(),
      payload: ev.payload,
      runId: ev.runId,
      version: ev.version,
      patchRef: ev.patchRef,
      prRef: ev.prRef,
    }));
  },
});

// Mutación autenticada para registrar latidos (Heartbeats) por tenant
export const pingConnection = mutation({
  args: {
    serverSecret: v.string(),
    connectionId: v.string(),
    tenantId: v.string(),
    harnessType: v.optional(v.string()),
    executing: v.optional(v.boolean()),
    isMock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);

    const existing = await ctx.db
      .query("orchestratorConnections")
      .withIndex("by_tenant_connection", (q) =>
        q.eq("tenantId", args.tenantId).eq("connectionId", args.connectionId)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastHeartbeat: now,
        ...(args.harnessType !== undefined ? { harnessType: args.harnessType } : {}),
        ...(args.executing !== undefined ? { executing: args.executing } : {}),
        ...(args.isMock !== undefined ? { isMock: args.isMock } : {}),
      });
      return existing._id;
    }

    const { serverSecret: _secret, ...connData } = args;
    return await ctx.db.insert("orchestratorConnections", {
      ...connData,
      lastHeartbeat: now,
    });
  },
});

// Query autenticada y aislada por tenant (alineada con HEARTBEAT_STALE_MS = 60000 de Kevin)
export const getActiveConnections = query({
  args: {
    serverSecret: v.string(),
    tenantId: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);

    const connections = await ctx.db
      .query("orchestratorConnections")
      .withIndex("by_tenant_connection", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    const now = Date.now();
    const UMBRAL_ACTIVO = 60 * 1000;

    return connections
      .filter((conn) => now - conn.lastHeartbeat < UMBRAL_ACTIVO)
      .map((conn) => ({
        agentKey: conn.connectionId,
        name: conn.connectionId,
        status: conn.executing ? "working" : "idle",
        meta: {
          harnessType: conn.harnessType ?? conn.connectionId,
          connected: true,
          executing: conn.executing ?? false,
          lastHeartbeatAt: new Date(conn.lastHeartbeat).toISOString(),
          isMock: conn.isMock,
        },
      }));
  },
});