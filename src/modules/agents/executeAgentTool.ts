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
import { HarnessInputError, normalizeActivityInput } from '@/src/lib/harnessInput';
import {
  assignHarnessActivity,
  getHarnessConnections,
  getRunEvents,
  isSafeId,
  listTenantActivities,
  sendRunCommand,
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

async function listActivities(args: Record<string, unknown>, scopeHarness: string | null = null) {
  const runId = asString(args.runId);
  if (runId !== undefined && !isSafeId(runId)) {
    throw new Error('runId inválido.');
  }

  const requestedHarness = asString(args.harnessType);
  if (requestedHarness !== undefined && !isHarnessType(requestedHarness)) {
    throw new Error('harnessType inválido (support | b2b | prospecting | marketing).');
  }
  if (scopeHarness && requestedHarness && requestedHarness !== scopeHarness) {
    throw new Error('Solo puedes consultar actividades de tu propio arnés.');
  }
  const harnessType = scopeHarness ?? requestedHarness;

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

/** Ejecuta una tool de LECTURA ya validada por `parseToolCall`. Las de escritura se rechazan. */
export async function executeAgentTool(
  call: ToolCall,
  context: { sessionId: string; harnessType?: string | null }
): Promise<AgentToolOutcome> {
  const def = getAgentTool(call.tool);
  if (!def) {
    return { tool: String(call.tool), ok: false, error: `Herramienta desconocida: ${String(call.tool)}.` };
  }
  if (def.kind !== 'read') {
    return {
      tool: call.tool,
      ok: false,
      error: `La herramienta ${call.tool} requiere confirmación explícita del operador.`,
    };
  }

  try {
    switch (call.tool) {
      case 'run_overview': {
        const runId = asString(call.args.runId);
        if (!isSafeId(runId)) throw new Error('runId inválido o ausente.');
        return { tool: call.tool, ok: true, data: await runOverview(runId) };
      }
      case 'list_activities':
        return {
          tool: call.tool,
          ok: true,
          data: await listActivities(call.args, context.harnessType ?? null),
        };
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

/** Resumen determinista y fiel de una tool de lectura (no pasa por el modelo). */
export function summarizeToolOutcome(outcome: AgentToolOutcome): string {
  if (!outcome.ok) return `No pude completar la consulta (${outcome.tool}): ${outcome.error}`;

  const data = outcome.data as any;

  const statusBreakdown = (rows: any[]) => {
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    return Object.entries(byStatus)
      .map(([status, n]) => `${n} ${status}`)
      .join(', ');
  };

  switch (outcome.tool) {
    case 'run_overview': {
      const acts = Array.isArray(data.activities) ? data.activities : [];
      const types = Object.entries(data.eventsByType ?? {})
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, n]) => `${type}×${n}`)
        .join(', ');
      return [
        `Run ${data.runId}: ${data.eventCount} evento(s) (${data.firstAt ?? '—'} → ${data.lastAt ?? '—'}).`,
        types ? `Tipos de evento: ${types}.` : '',
        `Actividades: ${acts.length}${acts.length ? ` (${statusBreakdown(acts)})` : ''}.`,
        `Errores recientes: ${Array.isArray(data.recentErrors) ? data.recentErrors.length : 0}.`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'list_activities': {
      const rows = Array.isArray(data.activities) ? data.activities : [];
      const recent = rows
        .slice(0, 5)
        .map(
          (row: any) =>
            `- ${row.harnessType}/${row.activity} · ${row.status}${row.error ? ` (${row.error})` : ''} · run ${row.runId}`,
        )
        .join('\n');
      return [
        `Actividades encontradas: ${data.count}${rows.length ? ` (${statusBreakdown(rows)})` : ''}.`,
        recent ? `Más recientes:\n${recent}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'harness_health': {
      const harnesses = Array.isArray(data.harnesses) ? data.harnesses : [];
      if (!harnesses.length) return 'No hay conexiones de arneses registradas.';
      const lines = harnesses.map(
        (h: any) =>
          `- ${h.harness} (${h.agentKey}): ${
            h.connected === true ? 'conectado' : h.connected === false ? 'desconectado' : 'conexión desconocida'
          }${h.executing ? ' · ejecutando' : ''}${h.stale ? ' · stale' : ''}`,
      );
      return [`Arneses (${harnesses.length}):`, ...lines].join('\n');
    }
    case 'list_agents': {
      const agents = Array.isArray(data.agents) ? data.agents : [];
      const lines = agents.slice(0, 10).map((a: any) => `- ${a.name} (${a.agentKey}) · ${a.status}`);
      return [`Agentes en la sesión: ${data.count}.`, ...lines].join('\n');
    }
    default:
      return JSON.stringify(data).slice(0, 1200);
  }
}

/**
 * Ejecuta una tool de ESCRITURA ya confirmada por el operador (`confirmTool`).
 * El servidor revalida arnés/actividad/args: la confirmación de UI no exime de validar.
 */
export async function executeConfirmedAgentTool(
  call: ToolCall,
  context: { harnessType?: string | null } = {}
): Promise<AgentToolOutcome> {
  const def = getAgentTool(call.tool);
  if (!def) {
    return { tool: String(call.tool), ok: false, error: `Herramienta desconocida: ${String(call.tool)}.` };
  }
  if (def.kind !== 'write') {
    return { tool: call.tool, ok: false, error: `La herramienta ${call.tool} es de lectura y no requiere confirmación.` };
  }

  try {
    switch (call.tool) {
      case 'assign_activity': {
        const requestedHarness = asString(call.args.harnessType, 40);
        if (context.harnessType) {
          if (requestedHarness && requestedHarness !== context.harnessType) {
            throw new Error('Solo puedes asignar actividades de tu propio arnés.');
          }
        } else if (!requestedHarness) {
          throw new Error('Falta harnessType para asignar la actividad.');
        }
        const harnessType = context.harnessType ?? requestedHarness;
        const activity = asString(call.args.activity, 80);
        const title = asString(call.args.title, 120);
        const normalized = normalizeActivityInput(harnessType, activity, call.args.input ?? {});
        const assigned = await assignHarnessActivity({
          harnessType: normalized.harnessType,
          activity: activity as string,
          title: title || undefined,
          input: normalized.input,
          createdBy: 'dashboard:orchestrator',
        });

        return {
          tool: call.tool,
          ok: true,
          data: {
            ...assigned,
            harnessType: normalized.harnessType,
            activity,
            title: title ?? null,
            note: 'En cola: la ejecuta el worker. Todavía no se ha ejecutado.',
          },
        };
      }
      case 'request_control': {
        const runId = asString(call.args.runId);
        const agentKey = asString(call.args.agentKey);
        const command = call.args.command;
        if (!isSafeId(runId) || !isSafeId(agentKey)) throw new Error('runId/agentKey inválidos.');
        if (command !== 'pause' && command !== 'kill') throw new Error('command debe ser pause o kill.');

        const result = await sendRunCommand({ runId, agentKey, command });
        return {
          tool: call.tool,
          ok: true,
          data: {
            ...result,
            runId,
            agentKey,
            command,
            note: 'Solicitud registrada; NO confirmada hasta que llegue agent.paused/agent.stopped.',
          },
        };
      }
      default:
        return { tool: call.tool, ok: false, error: 'Herramienta de escritura no implementada.' };
    }
  } catch (err) {
    if (err instanceof SwarmyConfigError) {
      return {
        tool: call.tool,
        ok: false,
        error: `Configuración de Swarmy incompleta: faltan ${err.missing.join(', ')}.`,
      };
    }
    if (err instanceof HarnessInputError) {
      return { tool: call.tool, ok: false, error: `Input inválido: ${err.message}` };
    }
    const message = err instanceof Error ? err.message : 'Error ejecutando la acción.';
    return { tool: call.tool, ok: false, error: message.slice(0, 500) };
  }
}

/** Mensaje determinista tras confirmar una acción (se persiste en el hilo). */
export function summarizeConfirmedToolOutcome(outcome: AgentToolOutcome): string {
  if (!outcome.ok) return `No se ejecutó ${outcome.tool}: ${outcome.error}`;

  const data = outcome.data as any;
  switch (outcome.tool) {
    case 'assign_activity':
      return [
        `Actividad encolada: \`${data.activity}\` en el arnés \`${data.harnessType}\`.`,
        `activityId \`${data.activityId}\` · runId \`${data.runId}\`.`,
        'Queda en cola hasta que el worker la reclame (no se ha ejecutado todavía).',
      ].join(' ');
    case 'request_control':
      return [
        `Solicitud de ${data.command === 'kill' ? 'STOP (kill)' : 'PAUSE'} registrada para \`${data.agentKey}\` en el run \`${data.runId}\`.`,
        'Es una solicitud: no cuenta como confirmada hasta que llegue `agent.paused` / `agent.stopped`.',
      ].join(' ');
    default:
      return `Ejecutado ${outcome.tool}.`;
  }
}
