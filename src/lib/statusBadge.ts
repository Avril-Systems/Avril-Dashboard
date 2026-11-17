/**
 * UNICO mapeo "estado del backend -> badge de UI". La UI NO debe decidir
 * colores/etiquetas por su cuenta: todo pasa por aquí.
 *
 * Reglas de honestidad:
 *   - Un estado que no conocemos NO se maquilla: sale 'unknown' con el valor crudo.
 *   - El origen (mock/real/unknown) es un badge APARTE y siempre se muestra.
 *   - "Solicitado" (control enviado) nunca se muestra como "Pausado/Detenido".
 *
 * Lógica PURA. Compatible con Node type stripping (sin enums).
 */
import type { Origin, StepState, ControlView } from './handoffChain.ts';
import type { HarnessView } from './harnessStatus.ts';

export type UiStatus =
  | 'unregistered'
  | 'registered'
  | 'connected'
  | 'queued'
  | 'running'
  | 'blocked'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'stale'
  | 'error'
  | 'unknown';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export type Badge = { status: UiStatus; label: string; tone: Tone; raw?: string; hint?: string };

const BADGES: Record<UiStatus, { label: string; tone: Tone }> = {
  unregistered: { label: 'Sin registrar', tone: 'muted' },
  registered: { label: 'Registrado', tone: 'neutral' },
  connected: { label: 'Conectado', tone: 'info' },
  queued: { label: 'En cola', tone: 'neutral' },
  running: { label: 'Ejecutando', tone: 'success' },
  blocked: { label: 'Bloqueado', tone: 'warning' },
  paused: { label: 'Pausado', tone: 'warning' },
  stopped: { label: 'Detenido', tone: 'muted' },
  completed: { label: 'Completado', tone: 'success' },
  failed: { label: 'Fallido', tone: 'danger' },
  stale: { label: 'Stale', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
  unknown: { label: 'Desconocido', tone: 'muted' },
};

/** Valores crudos de las tablas de Convex y del SDD -> estado de UI. */
const RAW_TO_UI: Record<string, UiStatus> = {
  // orchestrationSessions
  queued: 'queued',
  spawning: 'queued',
  active: 'running',
  failed: 'failed',
  completed: 'completed',
  // orchestrationAgents
  idle: 'connected',
  working: 'running',
  blocked: 'blocked',
  error: 'error',
  // SDD / otros
  running: 'running',
  stopped: 'stopped',
  paused: 'paused',
  // agentRuns / deploymentJobs / tasks
  success: 'completed',
  succeeded: 'completed',
  done: 'completed',
  in_progress: 'running',
  todo: 'queued',
  cancelled: 'stopped',
  // runtimeInstances
  starting: 'queued',
  healthy: 'connected',
  // degraded no tiene badge propio: se trata como stale (conectado pero con problemas)
  degraded: 'stale',
};

export function badgeFor(status: UiStatus, extra?: { raw?: string; hint?: string }): Badge {
  const b = BADGES[status];
  return { status, label: b.label, tone: b.tone, ...extra };
}

/** Mapeo genérico de un estado crudo. Desconocido => 'unknown' + valor crudo visible. */
export function toUiBadge(raw: string | undefined | null): Badge {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return badgeFor('unknown');
  const mapped = RAW_TO_UI[key];
  return mapped ? badgeFor(mapped, { raw: key }) : badgeFor('unknown', { raw: key });
}

/**
 * Badge principal de un harness. Prioridad (de mayor a menor):
 *   sin registrar > error > stale > ejecutando > conectado > registrado
 * `agentStatus` es orchestrationAgents.status si se tiene (para detectar 'error').
 */
export function harnessBadge(h: HarnessView, agentStatus?: string): Badge {
  if (!h.registered) return badgeFor('unregistered');
  if ((agentStatus ?? '').toLowerCase() === 'error') return badgeFor('error', { raw: 'error' });
  if (h.stale) {
    return badgeFor('stale', { hint: h.lastHeartbeatAt ? `Último heartbeat: ${h.lastHeartbeatAt}` : undefined });
  }
  if (h.executing === true) return badgeFor('running');
  if (h.connected === true) return badgeFor('connected');
  if (h.connected === false) return badgeFor('registered', { hint: 'Registrado pero sin conexión' });
  return badgeFor('registered', { hint: 'Estado de conexión desconocido (el backend no lo reporta)' });
}

/** Origen: SIEMPRE visible junto al estado. 'unknown' NO se presenta como real. */
export function originBadge(origin: Origin): { label: string; tone: Tone; hint: string } {
  switch (origin) {
    case 'mock':
      return { label: 'MOCK', tone: 'warning', hint: 'Dato simulado. No es ejecución real.' };
    case 'real':
      return { label: 'REAL', tone: 'success', hint: 'Evento real del backend.' };
    default:
      return { label: 'SIN ORIGEN', tone: 'muted', hint: 'El evento no declara si es mock o real.' };
  }
}

/** Control pause/stop: "Solicitado" != "Confirmado". */
export function controlBadge(c: ControlView): Badge {
  const verb = c.command === 'pause' ? 'pausa' : 'detención';
  if (c.state === 'confirmed') return badgeFor(c.command === 'pause' ? 'paused' : 'stopped', { hint: `Confirmado: ${c.confirmedAt ?? ''}`.trim() });
  if (c.state === 'unconfirmed_timeout') {
    return { status: 'blocked', label: 'Sin confirmar', tone: 'danger', hint: `La ${verb} se solicitó pero el backend no la confirmó a tiempo.` };
  }
  return { status: 'queued', label: 'Solicitado', tone: 'info', hint: `Esperando confirmación de la ${verb}.` };
}

/** Eslabón de la cadena de handoff. */
export function stepBadge(state: StepState): { label: string; tone: Tone } {
  if (state === 'done') return { label: 'Completado', tone: 'success' };
  if (state === 'failed') return { label: 'Fallido', tone: 'danger' };
  return { label: 'Pendiente', tone: 'muted' };
}
