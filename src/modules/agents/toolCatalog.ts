/**
 * Catálogo de herramientas del orquestador (S02).
 *
 * `read`: consultan estado real (Swarmy/Convex) y se ejecutan en el turno.
 * `write`: proponen una acción real; el servidor NO las ejecuta en el turno del
 * modelo. Se devuelve una propuesta y solo se ejecutan cuando el operador confirma
 * explícitamente en la UI (POST con `confirmTool`).
 *
 * Puro, sin imports de servidor: prompt, validador y UI comparten la definición.
 * Regla: si una tool no tiene ejecutor real, no existe aquí.
 */

export type AgentToolName =
  | 'run_overview'
  | 'list_activities'
  | 'harness_health'
  | 'list_agents'
  | 'get_activity_result'
  | 'assign_activity'
  | 'request_control';

export type AgentToolKind = 'read' | 'write';

export type AgentToolArg = {
  name: string;
  type: 'string' | 'number' | 'object';
  required?: boolean;
  description: string;
};

export type AgentToolDef = {
  name: AgentToolName;
  kind: AgentToolKind;
  description: string;
  args: AgentToolArg[];
};

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: 'run_overview',
    kind: 'read',
    description:
      'Resumen real de un run de Swarmy: número de eventos, rango temporal, tipos de evento, errores recientes y actividades asignadas.',
    args: [{ name: 'runId', type: 'string', required: true, description: 'runId del run (p. ej. run_marketing_...).' }],
  },
  {
    name: 'list_activities',
    kind: 'read',
    description:
      'Actividades de los arneses (cola durable de Convex) con su estado real: queued, running, completed, failed, blocked o cancelled.',
    args: [
      { name: 'runId', type: 'string', description: 'Filtra por runId.' },
      { name: 'harnessType', type: 'string', description: 'support | b2b | prospecting | marketing.' },
      { name: 'status', type: 'string', description: 'queued | running | completed | failed | blocked | cancelled.' },
      { name: 'limit', type: 'number', description: '1–50 (default 20).' },
    ],
  },
  {
    name: 'harness_health',
    kind: 'read',
    description:
      'Estado de los cuatro arneses según sus heartbeats reales: conectado, ejecutando, último latido y si está stale (>60 s).',
    args: [],
  },
  {
    name: 'list_agents',
    kind: 'read',
    description:
      'Agentes registrados en la sesión de orquestación actual (agentKey, nombre, rol y estado). No permite consultar otra sesión.',
    args: [],
  },
  {
    name: 'get_activity_result',
    kind: 'read',
    description:
      'Recupera el resultado real persistido de UNA actividad concreta (bajo demanda). Úsalo para interpretar qué encontró el arnés y decidir el siguiente paso; no cargues todos los resultados.',
    args: [
      {
        name: 'activityId',
        type: 'string',
        required: true,
        description: 'activityId devuelto por list_activities o run_overview.',
      },
    ],
  },
  {
    name: 'assign_activity',
    kind: 'write',
    description:
      'Propone encolar una actividad real de un arnés (crea run + actividad queued; la ejecuta el worker). Requiere confirmación del operador.',
    args: [
      { name: 'harnessType', type: 'string', description: 'Orquestador: arnés destino (obligatorio). Agente de arnés: se ignora; el servidor usa el suyo.' },
      {
        name: 'activity',
        type: 'string',
        required: true,
        description:
          'Clave exacta del catálogo: support_ticket_triage | incident_triage | b2b_intake_original | account_qualification | github_discovery_original | github_discovery | marketing_campaign | site_audit.',
      },
      { name: 'input', type: 'object', description: 'Input de la actividad según su definición (sin secretos).' },
      { name: 'title', type: 'string', description: 'Título corto opcional para el run.' },
    ],
  },
  {
    name: 'request_control',
    kind: 'write',
    description:
      'Propone registrar una solicitud de pause o kill para un agente de un run. Es una SOLICITUD: no se confirma hasta que llegue agent.paused/agent.stopped. Requiere confirmación del operador.',
    args: [
      { name: 'runId', type: 'string', required: true, description: 'runId del run.' },
      { name: 'agentKey', type: 'string', required: true, description: 'agentKey del agente.' },
      { name: 'command', type: 'string', required: true, description: 'pause | kill.' },
    ],
  },
];

export function getAgentTool(name: string): AgentToolDef | null {
  return AGENT_TOOLS.find((tool) => tool.name === name) ?? null;
}

export function isWriteTool(name: string): boolean {
  return getAgentTool(name)?.kind === 'write';
}

/** Tools disponibles para un agente. El orquestador ve todas; un arnés solo las suyas. */
const HARNESS_TOOL_NAMES: AgentToolName[] = ['list_activities', 'get_activity_result', 'assign_activity'];

export function toolsForAgent(harnessType: string | null): AgentToolDef[] {
  if (!harnessType) return AGENT_TOOLS;
  return AGENT_TOOLS.filter((tool) => HARNESS_TOOL_NAMES.includes(tool.name));
}

export function isToolAllowedForAgent(name: string, harnessType: string | null): boolean {
  return toolsForAgent(harnessType).some((tool) => tool.name === name);
}
