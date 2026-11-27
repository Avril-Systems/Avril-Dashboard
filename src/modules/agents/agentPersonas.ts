/**
 * Identidad canónica de los agentes del Agent Office (S01).
 *
 * Un agente se identifica SIEMPRE por `agentKey` dentro de una sesión de orquestación
 * (`orchestrationAgents.agentKey`). De ahí colgamos:
 *   - su persona (misión y capacidades reales de su arnés), y
 *   - su conversación 1:1 (ver `serverAgentChats` en Convex).
 *
 * Regla de honestidad: las capacidades salen del catálogo real de actividades
 * (`convex/lib/harnessActivities.ts`) que el worker puede ejecutar. Si el agente
 * no tiene arnés conocido, se resuelve como orquestador y NO se le atribuyen
 * herramientas que no existen.
 */
import { HARNESS_CATALOG, HARNESS_TYPES, isHarnessType } from '@/convex/lib/harnessActivities';
import type { HarnessType } from '@/convex/lib/harnessActivities';

export type AgentMetaInput = { agentKey: string; name?: string | null; role?: string | null; meta?: unknown };

export type AgentKind = 'orchestrator' | 'harness' | 'unknown';

export type AgentPersona = {
  /** Arnés real detrás del agente; null = sin arnés (orquestador o desconocido). */
  harnessType: HarnessType | null;
  kind: AgentKind;
  /** Solo orquestador/arnés registrados pueden actuar y usar tools. */
  authorized: boolean;
  label: string;
  mission: string;
  capabilities: string[];
  boundaries: string[];
};

const SHARED_BOUNDARIES = [
  'No ejecutas acciones tú mismo en esta conversación: no envías correos, no publicas, no compras, no tocas producción ni lanzas procesos.',
  'Para ejecutar trabajo real, el operador asigna una actividad en Runs (`/agents/swarmy`) o en el panel "Asignar actividad". El worker (`npm run harness:worker`) la reclama y ejecuta; el resultado queda en el run.',
  'No inventes resultados de ejecución, métricas, handles, tickets ni URLs que no estén en el contexto de la conversación.',
  'Si falta un dato de entrada (URLs, tickets, briefing, sector), pide exactamente lo que falta antes de proponer la actividad.',
  'Nunca pidas ni repitas secretos, API keys ni tokens. El input de una actividad no los acepta.',
  'Marca como supuesto explícito cualquier inferencia que hagas.',
];

const HARNESS_MISSIONS: Record<HarnessType, string> = {
  support:
    'Triaje de soporte: clasificas tickets e incidentes, detectas severidad y escalamiento, y preparas el handoff para desarrollo sin enviar nada.',
  b2b:
    'Captación y calificación B2B: clasificas solicitudes entrantes, detectas datos faltantes, calificas cuentas y preparas borradores sin enviarlos.',
  prospecting:
    'Prospección: descubres y verificas candidatos, los priorizas con evidencia y propones el siguiente paso comercial.',
  marketing:
    'Marketing: conviertes un briefing en piezas de contenido con investigación y fact-check, sin publicar nada.',
};

const ORCHESTRATOR_PERSONA: AgentPersona = {
  harnessType: null,
  kind: 'orchestrator',
  authorized: true,
  label: 'Orquestador',
  mission:
    'Coordinas el trabajo del run: resumes el estado real, decides a qué agente delegar cada tarea y cuidas que nada se reporte como hecho sin evidencia.',
  capabilities: [
    'Resumir el estado del run a partir de eventos y actividades (`orchestratorEvents`, `harnessActivities`).',
    'Proponer el siguiente paso y a qué arnés asignarlo.',
    'Detectar bloqueos, dependencias y decisiones que requieren aprobación humana.',
  ],
  boundaries: [
    ...SHARED_BOUNDARIES,
    'No eres Avril la arquitecta: no haces la entrevista de founder ni emites el JSON de ignición. Ese flujo vive en `/chats` y `/start/idea`.',
  ],
};

export function resolveHarnessType(input: { agentKey: string; meta?: unknown }): HarnessType | null {
  const meta =
    input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)
      ? (input.meta as Record<string, unknown>)
      : {};

  for (const candidate of [meta.harnessType, meta.harness]) {
    if (isHarnessType(candidate)) return candidate;
  }

  const key = input.agentKey.trim();
  if (isHarnessType(key)) return key;
  for (const harness of HARNESS_TYPES) {
    if (key.startsWith(`${harness}:`) || key.startsWith(`${harness}-`)) return harness;
  }
  return null;
}

const ORCHESTRATOR_ROLES = new Set([
  'orchestrator',
  'orquestador',
  'coordinator',
  'coordinador',
  'manager',
  'coordination',
]);
const ORCHESTRATOR_KEYS = new Set(['swarm-strategy', 'orchestrator', 'orquestador']);

function metaString(meta: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  }
  return '';
}

/** Orquestador SOLO si la identidad lo declara; un agente desconocido no hereda el rol. */
export function isOrchestratorAgent(input: { agentKey: string; role?: string | null; meta?: unknown }): boolean {
  if (resolveHarnessType(input)) return false;

  const meta =
    input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)
      ? (input.meta as Record<string, unknown>)
      : {};
  const key = input.agentKey.trim().toLowerCase();
  const role = (input.role ?? '').trim().toLowerCase();
  const metaRole = metaString(meta, ['role', 'agentType', 'agent_type', 'kind']);

  return (
    ORCHESTRATOR_KEYS.has(key) ||
    ORCHESTRATOR_ROLES.has(role) ||
    ORCHESTRATOR_ROLES.has(metaRole) ||
    meta.orchestrator === true
  );
}

const UNKNOWN_PERSONA: AgentPersona = {
  harnessType: null,
  kind: 'unknown',
  authorized: false,
  label: 'Agente no registrado',
  mission:
    'Sin identidad autorizada en esta sesión. No puedes actuar como orquestador ni usar herramientas hasta que el operador registre tu rol.',
  capabilities: [],
  boundaries: [
    'No tienes permisos de orquestador.',
    'No inventes una identidad ni asumas capacidades que no estén registradas.',
  ],
};

/** Persona del agente. Arnés conocido o rol de orquestador explícito; el resto no está autorizado. */
export function buildAgentPersona(input: { agentKey: string; role?: string | null; meta?: unknown }): AgentPersona {
  const harnessType = resolveHarnessType(input);
  if (harnessType) {
    const harness = HARNESS_CATALOG[harnessType];
    return {
      harnessType,
      kind: 'harness',
      authorized: true,
      label: harness.label,
      mission: HARNESS_MISSIONS[harnessType],
      capabilities: harness.activities.map(
        (activity) =>
          `${activity.label} [${activity.origin === 'original' ? 'original' : 'adicional'}] — ${activity.description}`,
      ),
      boundaries: [...SHARED_BOUNDARIES],
    };
  }

  if (isOrchestratorAgent(input)) {
    return { ...ORCHESTRATOR_PERSONA, boundaries: [...ORCHESTRATOR_PERSONA.boundaries] };
  }

  return { ...UNKNOWN_PERSONA, boundaries: [...UNKNOWN_PERSONA.boundaries] };
}

export type ResolvedAgentIdentity = {
  agentKey: string;
  name: string;
  role: string | null;
  persona: AgentPersona;
};

export function resolveAgentIdentity(input: AgentMetaInput): ResolvedAgentIdentity {
  const name = (input.name ?? '').trim() || input.agentKey;
  const role = (input.role ?? '').trim() || null;
  return {
    agentKey: input.agentKey.trim(),
    name,
    role,
    persona: buildAgentPersona(input),
  };
}
