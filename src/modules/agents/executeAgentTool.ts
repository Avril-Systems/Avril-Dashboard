/**
 * Ejecución server-only de las tools de lectura del orquestador (S02a).
 *
 * Todo sale de fuentes reales:
 *   - Swarmy (`swarmyServer`): eventos por run, actividades de la cola, heartbeats.
 *   - Convex de la app (`convexServer`): agentes de la sesión.
 *
 * Nunca hay side effects: no asigna actividades, no pausa/detiene agentes.
 * Si falta configuración o el backend falla, devuelve un error explícito
 * (la UI/modelo lo dice tal cual; no se inventan datos).
 */
import { isHarnessType } from '@/convex/lib/harnessActivities';
import { listOrchestrationAgents } from '@/src/lib/convexServer';
import {
  getHarnessConnections,
  getRunEvents,
  isSafeId,
  listTenantActivities,
  SwarmyConfigError,
} from '@/src/lib/swarmyServer';
import type { HarnessActivityRow } from '@/src/lib/swarmyServer';
import { getAgentTool } from './toolCatalog';
import type { ToolCall } from './toolProtocol';

export type AgentToolOutcome =
  | { tool: string; ok: true; data: unknown }
  | { tool: string; ok: false; error: string };

const MAX_ITEMS = 20;
const STALE_MS = 60_000;
const ACTIVITY_STATUSES = ['queued', 'running', 'completed', 'failed', 'blocked', 'cancelled'] as const;

type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

function asString(value: unknown, max = 256): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function asLimit(value: unknown, fallback = 20): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(n)));
}

function compactActivity(row: HarnessActivityRow) {
  return {
    activityId: row.activityId,
    runId: row.runId,
    harnessType: row.harnessType,
    activity: row.activity,
    title: row.title,
    status: row.status,
    error: row.error ?? null,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt ?? null,
  };
}

async function runOverview(runId: string) {
  const [events, activities] = await Promise.all([
    getRunEvents(runId),
    listTenantActivities({ runId, includeResult: false, limit: MAX_ITEMS }),
  ]);

  const eventsByType: Record<string, number> = {};
  for (const event of events) {
    eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
  }

  const recentErrors = events
    .filter((event) => event.type === 'error.reported')
    .slice(-5)
    .map((event) => ({ at: event.createdAt, payload: event.payload ?? null }));

  return {
    runId,
    eventCount: events.length,
    firstAt: events[0]?.createdAt ?? null,
    lastAt: events[events.length - 1]?.createdAt ?? null,
    lastType: events[events.length - 1]?.type ?? null,
    eventsByType,
    recentErrors,
    activities: activities.slice(0, MAX_ITEMS).map(compactActivity),
  };
}

async function listActivities(args: Record<string, unknown>) {
  const runId = asString(args.runId);
  if (args.runId !== undefined && !isSafeId(runId)) {
    throw new Error('runId inválido.');
  }

  const harnessType = asString(args.harnessType);
  if (harnessType !== undefined && !isHarnessType(harnessType)) {
    throw new Error('harnessType inválido (support | b2b | prospecting | marketing).');
  }

  const statusRaw = asString(args.status);
  if (statusRaw !== undefined && !ACTIVITY_STATUSES.includes(statusRaw as ActivityStatus)) {
    throw new Error(`status inválido (${ACTIVITY_STATUSES.join(' | ')}).`);
  }

  const rows = await listTenantActivities({
    ...(runId ? { runId } : {}),
    ...(harnessType ? { harnessType } : {}),
    ...(statusRaw ? { status: statusRaw as ActivityStatus } : {}),
    includeResult: false,
    limit: asLimit(args.limit),
  });

  return {
    count: rows.length,
    activities: rows.map(compactActivity),
  };
}

async function harnessHealth() {
  const connections = await getHarnessConnections();
  const now = Date.now();

  const harnesses = connections.map((connection) => {
    const meta =
      connection.meta && typeof connection.meta === 'object' && !Array.isArray(connection.meta)
        ? (connection.meta as Record<string, unknown>)
        : {};
    const lastHeartbeat = typeof meta.lastHeartbeatAt === 'number' ? meta.lastHeartbeatAt : null;

    return {
      agentKey: connection.agentKey,
      harness: connection.name,
      status: connection.status,
      connected: typeof meta.connected === 'boolean' ? meta.connected : null,
      executing: typeof meta.executing === 'boolean' ? meta.executing : null,
      lastHeartbeatAt: lastHeartbeat !== null ? new Date(lastHeartbeat).toISOString() : null,
      stale: lastHeartbeat !== null ? now - lastHeartbeat > STALE_MS : null,
      isMock: typeof meta.isMock === 'boolean' ? meta.isMock : null,
    };
  });

  return {
    checkedAt: new Date(now).toISOString(),
    staleAfterMs: STALE_MS,
    count: harnesses.length,
    harnesses,
  };
}

async function listAgents(sessionId: string) {
  const rows = await listOrchestrationAgents({ sessionId });
  const agents = (rows ?? []).map((agent: any) => ({
    agentKey: agent.agentKey,
    name: agent.name,
    role: agent.role ?? null,
    status: agent.status,
    parentAgentKey: agent.parentAgentKey ?? null,
    updatedAt: agent.updatedAt ?? null,
  }));

  return { sessionId, count: agents.length, agents };
}

/** Ejecuta una tool ya validada por `parseToolCall`. */
export async function executeAgentTool(
  call: ToolCall,
  context: { sessionId: string }
): Promise<AgentToolOutcome> {
  const def = getAgentTool(call.tool);
  if (!def) {
    return { tool: String(call.tool), ok: false, error: `Herramienta desconocida: ${String(call.tool)}.` };
  }

  try {
    switch (call.tool) {
      case 'run_overview': {
        const runId = asString(call.args.runId);
        if (!isSafeId(runId)) throw new Error('runId inválido o ausente.');
        return { tool: call.tool, ok: true, data: await runOverview(runId) };
      }
      case 'list_activities':
        return { tool: call.tool, ok: true, data: await listActivities(call.args) };
      case 'harness_health':
        return { tool: call.tool, ok: true, data: await harnessHealth() };
      case 'list_agents': {
        if (!isSafeId(context.sessionId)) throw new Error('Sesión inválida.');
        return { tool: call.tool, ok: true, data: await listAgents(context.sessionId) };
      }
      default:
        return { tool: call.tool, ok: false, error: 'Herramienta no implementada.' };
    }
  } catch (err) {
    if (err instanceof SwarmyConfigError) {
      return {
        tool: call.tool,
        ok: false,
        error: `Configuración de Swarmy incompleta: faltan ${err.missing.join(', ')}.`,
      };
    }
    const message = err instanceof Error ? err.message : 'Error ejecutando la herramienta.';
    return { tool: call.tool, ok: false, error: message.slice(0, 500) };
  }
}

/** Resumen determinista cuando el modelo no puede redactar la respuesta final. */
export function summarizeToolOutcome(outcome: AgentToolOutcome): string {
  if (!outcome.ok) return `No pude completar la consulta (${outcome.tool}): ${outcome.error}`;

  const data = outcome.data as any;
  switch (outcome.tool) {
    case 'run_overview':
      return [
        `Run ${data.runId}: ${data.eventCount} evento(s).`,
        `Primer evento: ${data.firstAt ?? '—'} · último: ${data.lastAt ?? '—'} (${data.lastType ?? '—'}).`,
        `Actividades: ${Array.isArray(data.activities) ? data.activities.length : 0}.`,
        `Errores recientes: ${Array.isArray(data.recentErrors) ? data.recentErrors.length : 0}.`,
      ].join(' ');
    case 'list_activities':
      return `Actividades encontradas: ${data.count}.`;
    case 'harness_health':
      return `Arneses: ${(data.harnesses ?? [])
        .map((h: any) => `${h.harness}${h.connected === true ? ' conectado' : h.connected === false ? ' desconectado' : ' desconocido'}${h.stale ? ' (stale)' : ''}`)
        .join(', ')}.`;
    case 'list_agents':
      return `Agentes en la sesión: ${data.count}.`;
    default:
      return JSON.stringify(data).slice(0, 1200);
  }
}
