/**
 * SOLO SERVIDOR (rutas de Next). Lee/escribe en el backend de Alejandro (orchestratorEvents) con
 * CONVEX_SERVER_SECRET. Ese secreto NUNCA debe salir al navegador ni a los logs.
 *
 * Usa anyApi (referencias por nombre) para no depender de convex/_generated hasta que el PR de
 * Alejandro (schema + serverOrchestration) esté integrado. En tiempo de ejecución las funciones
 * deben existir en el deployment al que apunta CONVEX_URL.
 *
 * Variables (solo NOMBRES; los valores no van en el repo):
 *   SWARMY_CONVEX_URL, SWARMY_CONVEX_SERVER_SECRET, SWARMY_TENANT_ID, SWARMY_WORKSPACE_ID
 * Los dos primeros son DISTINTOS de CONVEX_URL / CONVEX_SERVER_SECRET a propósito: las rutas existentes de
 * /api/orchestration usan esas variables para tu Convex de desarrollo, y no deben chocar con el staging de Swarmy.
 * Si no se definen, se usan como respaldo CONVEX_URL / NEXT_PUBLIC_CONVEX_URL y CONVEX_SERVER_SECRET.
 */
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, requireDashboardToken } from '@/src/lib/apiSecurity';

export class SwarmyConfigError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Falta configuración: ${missing.join(', ')}`);
    this.name = 'SwarmyConfigError';
    this.missing = missing;
  }
}

export type SwarmyConfig = { url: string; serverSecret: string; tenantId: string; workspaceId: string };

export function getSwarmyConfig(): SwarmyConfig {
  const url = process.env.SWARMY_CONVEX_URL ?? process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? '';
  const serverSecret = process.env.SWARMY_CONVEX_SERVER_SECRET ?? process.env.CONVEX_SERVER_SECRET ?? '';
  const tenantId = process.env.SWARMY_TENANT_ID ?? '';
  const workspaceId = process.env.SWARMY_WORKSPACE_ID ?? '';
  const missing: string[] = [];
  if (!url) missing.push('SWARMY_CONVEX_URL');
  if (!serverSecret) missing.push('SWARMY_CONVEX_SERVER_SECRET');
  if (!tenantId) missing.push('SWARMY_TENANT_ID');
  if (!workspaceId) missing.push('SWARMY_WORKSPACE_ID');
  if (missing.length) throw new SwarmyConfigError(missing);
  return { url, serverSecret, tenantId, workspaceId };
}

export type SwarmyEventRow = {
  _id: string;
  type: string;
  createdAt: string;
  payload?: unknown;
  runId?: string;
  version?: string;
  patchRef?: string;
  prRef?: string;
};

export type SwarmyConnectionRow = {
  agentKey: string;
  name: string;
  status: string;
  meta?: unknown;
};

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && SAFE_ID.test(v);
}

function redact(message: string, secret?: string) {
  return secret ? message.split(secret).join('[REDACTED]') : message;
}

export async function listTenantEvents(limit = 300): Promise<SwarmyEventRow[]> {
  const c = getSwarmyConfig();
  const client = new ConvexHttpClient(c.url);
  return (await client.query(anyApi.serverOrchestration.listEventsByTenant, {
    serverSecret: c.serverSecret,
    tenantId: c.tenantId,
    limit,
  })) as SwarmyEventRow[];
}

export async function getRunEvents(runId: string): Promise<SwarmyEventRow[]> {
  const c = getSwarmyConfig();
  const client = new ConvexHttpClient(c.url);
  return (await client.query(anyApi.serverOrchestration.getEventsByRun, {
    serverSecret: c.serverSecret,
    tenantId: c.tenantId,
    runId,
  })) as SwarmyEventRow[];
}

export async function getHarnessConnections(): Promise<SwarmyConnectionRow[]> {
  const c = getSwarmyConfig();
  const client = new ConvexHttpClient(c.url);
  return (await client.query(anyApi.serverOrchestration.getActiveConnections, {
    serverSecret: c.serverSecret,
    tenantId: c.tenantId,
  })) as SwarmyConnectionRow[];
}

/** Registra la SOLICITUD. No confirma nada: la confirmación debe llegar como evento agent.paused/agent.stopped. */
export async function sendRunCommand(input: { runId: string; agentKey: string; command: 'pause' | 'kill' }) {
  const c = getSwarmyConfig();
  const client = new ConvexHttpClient(c.url);
  const sentAt = new Date().toISOString();
  const res = (await client.mutation(anyApi.serverOrchestration.ingestEvent, {
    serverSecret: c.serverSecret,
    version: 'v1.0',
    tenantId: c.tenantId,
    workspaceId: c.workspaceId,
    runId: input.runId,
    eventType: 'agent.command.sent',
    payload: { agentKey: input.agentKey, command: input.command, isMock: false, requestedVia: 'dashboard' },
    idempotencyKey: `cmd_${input.runId}_${input.agentKey}_${input.command}_${Date.now()}`,
    humanApprovalRequired: false,
  })) as { status: string; eventId: string };
  return { commandId: res.eventId, status: res.status, sentAt };
}

/** Autenticación + rate limit comunes. Devuelve una respuesta de error o null si todo bien. */
export function guardRequest(req: Request, bucket: string, limit: number): Response | null {
  if (!requireDashboardToken(req)) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }
  if (hitRateLimit(`swarmy:${bucket}:${getClientIp(req)}`, limit)) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 });
  }
  return null;
}

export function errorResponse(err: unknown, code: string): Response {
  if (err instanceof SwarmyConfigError) {
    return NextResponse.json(
      { ok: false, error: { code: 'CONFIG_MISSING', message: err.message, missing: err.missing } },
      { status: 503 }
    );
  }
  const raw = err instanceof Error ? err.message : 'Error desconocido';
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message: redact(
          redact(raw, process.env.SWARMY_CONVEX_SERVER_SECRET),
          process.env.CONVEX_SERVER_SECRET
        ),
      },
    },
    { status: 500 }
  );
}
