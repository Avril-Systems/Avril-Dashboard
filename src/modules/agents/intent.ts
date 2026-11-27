/**
 * Detección de intención del orquestador (S05).
 *
 * Venice no tiene function calling y a veces ignora el protocolo de bloques. Este
 * módulo resuelve, con reglas explícitas y de alta confianza, tres intenciones:
 *
 *   - read:     consultar estado real (actividades, arneses, agentes, run)
 *   - proposal: asignar una actividad (requiere confirmación del operador)
 *   - control:  solicitar pause/kill (requiere confirmación; solicitud != confirmación)
 *
 * Si no hay señal clara devuelve `none` y el flujo normal del modelo sigue igual.
 * Es lógica PURA (sin red, sin React, sin Convex) y se prueba con `agents:check`.
 *
 * Regla: ante la duda, `none`. Nunca inventar args ni ejecutar una acción ambigua.
 */
import { ACTIVITY_KEYS, isActivityKey } from '../../../convex/lib/harnessActivities.ts';
import type { HarnessType } from '../../../convex/lib/harnessActivities.ts';

export type DetectedIntent =
  | { kind: 'none' }
  | {
      kind: 'read';
      tool: 'list_activities' | 'harness_health' | 'list_agents' | 'run_overview';
      args: Record<string, unknown>;
      reason: string;
    }
  | { kind: 'proposal'; tool: 'assign_activity'; args: Record<string, unknown>; reason: string }
  | { kind: 'control'; tool: 'request_control'; args: Record<string, unknown>; reason: string };

const HARNESS_HINTS: Array<{ type: HarnessType; re: RegExp }> = [
  { type: 'support', re: /\b(support|soporte|ticket|tickets|incidente|incidentes)\b/i },
  { type: 'b2b', re: /\b(b2b|cuentas?|captaci[oó]n|calificaci[oó]n|calificar)\b/i },
  { type: 'prospecting', re: /\b(prospecci[oó]n|prospecting|prospectos?|descubrimiento)\b/i },
  { type: 'marketing', re: /\b(marketing|campa[ñn]as?|contenido|auditor[ií]a|sitio)\b/i },
];

const ACTIVITY_HINTS: Array<{ harness: HarnessType; activity: string; re: RegExp }> = [
  { harness: 'support', activity: 'support_ticket_triage', re: /\btickets?\b/i },
  { harness: 'support', activity: 'incident_triage', re: /\bincidentes?\b/i },
  { harness: 'b2b', activity: 'b2b_intake_original', re: /\b(solicitudes?|captaci[oó]n)\b/i },
  { harness: 'b2b', activity: 'account_qualification', re: /\b(calificar|calificaci[oó]n|cuentas?)\b/i },
  { harness: 'prospecting', activity: 'github_discovery_original', re: /\b(original|prototipo)\b/i },
  { harness: 'prospecting', activity: 'github_discovery', re: /\b(github|descubrimiento|prospectos?)\b/i },
  { harness: 'marketing', activity: 'marketing_campaign', re: /\b(campa[ñn]as?|contenido)\b/i },
  { harness: 'marketing', activity: 'site_audit', re: /\b(sitio|auditor[ií]a|url)\b/i },
];

/** Actividades cuyo input es obligatorio y no se puede inferir del mensaje. */
const ACTIVITIES_NEEDING_INPUT = new Set(['support_ticket_triage', 'account_qualification', 'site_audit']);

/** Tope de confianza: solo se enrutan lecturas pedidas explícitamente. */
const DATA_VERBS = /\b(cu[aá]ntas?|cu[aá]l(es)?|qui[eé]nes|estado|est[aá]n|resumen|lista|listar|muestra|mu[eé]strame|ver|hay|eventos|conectad[oa]s?|salud|stale|latidos?|heartbeat|funcionan)\b/i;
const ASSIGN_VERBS = /\b(asigna|asignar|encola|encolar|lanza|lanzar|ejecuta|ejecutar)\b/i;
const CONTROL_VERBS = /\b(pausa|pausar|pause|stop|det[eé]n|detener|kill|mata)\b/i;
const KILL_VERBS = /\b(kill|stop|det[eé]n|detener|mata)\b/i;

function runIdOf(text: string): string | undefined {
  const match = text.match(/\brun_[A-Za-z0-9][A-Za-z0-9_.:-]*/i);
  return match?.[0]?.replace(/[.,;]+$/, '');
}

function harnessOf(text: string): HarnessType | undefined {
  return HARNESS_HINTS.find((hint) => hint.re.test(text))?.type;
}

function activityOf(text: string, harness?: HarnessType): string | undefined {
  for (const key of ACTIVITY_KEYS) {
    if (isActivityKey(key) && new RegExp(`\\b${key}\\b`).test(text)) return key;
  }
  const hints = harness ? ACTIVITY_HINTS.filter((hint) => hint.harness === harness) : ACTIVITY_HINTS;
  return hints.find((hint) => hint.re.test(text))?.activity;
}

function lookbackHoursOf(text: string): number | undefined {
  const named = text.match(/\blookback_?hours?\s*[=:]?\s*(\d{1,3})\b/i);
  const match = named ?? text.match(/\b(\d{1,3})\s*(?:h|horas?)\b/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 1 && value <= 168 ? value : undefined;
}

function statusOf(text: string): string | undefined {
  const match = text.match(/\b(queued|running|completed|failed|blocked|cancelled)\b/i);
  return match?.[1]?.toLowerCase();
}

function agentKeyOf(text: string): string | undefined {
  const backticked = text.match(/`([A-Za-z0-9][A-Za-z0-9_.:-]{1,60})`/);
  if (backticked) return backticked[1];
  const explicit = text.match(/\bagentKey\s*[=:]\s*([A-Za-z0-9][A-Za-z0-9_.:-]{1,60})/i);
  return explicit?.[1];
}

function readIntent(text: string): DetectedIntent {
  const explicit = text.match(/\b(list_activities|harness_health|list_agents|run_overview)\b/i)?.[1]?.toLowerCase();
  const runId = runIdOf(text);

  if (explicit === 'run_overview') {
    return runId
      ? { kind: 'read', tool: 'run_overview', args: { runId }, reason: 'tool explícita' }
      : { kind: 'none' };
  }
  if (explicit === 'harness_health') {
    return { kind: 'read', tool: 'harness_health', args: {}, reason: 'tool explícita' };
  }
  if (explicit === 'list_agents') {
    return { kind: 'read', tool: 'list_agents', args: {}, reason: 'tool explícita' };
  }
  if (explicit === 'list_activities') {
    const harnessType = harnessOf(text);
    const status = statusOf(text);
    return {
      kind: 'read',
      tool: 'list_activities',
      args: { ...(runId ? { runId } : {}), ...(harnessType ? { harnessType } : {}), ...(status ? { status } : {}) },
      reason: 'tool explícita',
    };
  }

  if (!DATA_VERBS.test(text)) return { kind: 'none' };

  if (runId && /\b(eventos|resumen|overview|estado)\b/i.test(text)) {
    return { kind: 'read', tool: 'run_overview', args: { runId }, reason: 'run + estado' };
  }

  if (/\b(actividades|cola)\b/i.test(text)) {
    const harnessType = harnessOf(text);
    const status = statusOf(text);
    return {
      kind: 'read',
      tool: 'list_activities',
      args: { ...(harnessType ? { harnessType } : {}), ...(status ? { status } : {}) },
      reason: 'pregunta por actividades',
    };
  }

  if (/\b(arn[eé]s(es)?|harness(es)?|heartbeat|latidos?|conectad[oa]s?|stale)\b/i.test(text)) {
    return { kind: 'read', tool: 'harness_health', args: {}, reason: 'pregunta por arneses' };
  }

  if (/\b(agentes|agents)\b/i.test(text)) {
    return { kind: 'read', tool: 'list_agents', args: {}, reason: 'pregunta por agentes' };
  }

  return { kind: 'none' };
}

function proposalIntent(text: string): DetectedIntent {
  if (!ASSIGN_VERBS.test(text)) return { kind: 'none' };

  const harnessType = harnessOf(text);
  if (!harnessType) return { kind: 'none' };

  const activity = activityOf(text, harnessType);
  if (!activity || ACTIVITIES_NEEDING_INPUT.has(activity)) return { kind: 'none' };

  const lookbackHours = lookbackHoursOf(text);
  const input = lookbackHours !== undefined ? { lookbackHours } : undefined;

  return {
    kind: 'proposal',
    tool: 'assign_activity',
    args: { harnessType, activity, ...(input ? { input } : {}) },
    reason: `asignar ${activity} a ${harnessType}`,
  };
}

function controlIntent(text: string): DetectedIntent {
  if (!CONTROL_VERBS.test(text)) return { kind: 'none' };

  const runId = runIdOf(text);
  const agentKey = agentKeyOf(text);
  if (!runId || !agentKey) return { kind: 'none' };

  return {
    kind: 'control',
    tool: 'request_control',
    args: { runId, agentKey, command: KILL_VERBS.test(text) ? 'kill' : 'pause' },
    reason: `control ${KILL_VERBS.test(text) ? 'kill' : 'pause'} de ${agentKey}`,
  };
}

/** Punto de entrada. Orden: control > acción > lectura > ninguna. */
export function detectIntent(message: string): DetectedIntent {
  const text = String(message ?? '').trim();
  if (!text) return { kind: 'none' };

  const control = controlIntent(text);
  if (control.kind !== 'none') return control;

  const proposal = proposalIntent(text);
  if (proposal.kind !== 'none') return proposal;

  return readIntent(text);
}
