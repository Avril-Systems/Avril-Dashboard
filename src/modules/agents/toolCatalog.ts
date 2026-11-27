/**
 * Catálogo de herramientas de LECTURA del orquestador (S02a).
 *
 * No ejecutan nada: solo consultan estado real (Swarmy/Convex). Se declaran aquí
 * (puro, sin imports de servidor) para que el prompt y el validador compartan la
 * misma definición. La ejecución vive en `executeAgentTool.ts` (solo servidor).
 *
 * Regla: si una tool no tiene ejecutor real, no existe en este catálogo.
 */

export type AgentToolName = 'run_overview' | 'list_activities' | 'harness_health' | 'list_agents';

export type AgentToolArg = {
  name: string;
  type: 'string' | 'number';
  required?: boolean;
  description: string;
};

export type AgentToolDef = {
  name: AgentToolName;
  description: string;
  args: AgentToolArg[];
};

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: 'run_overview',
    description:
      'Resumen real de un run de Swarmy: número de eventos, rango temporal, tipos de evento, errores recientes y actividades asignadas.',
    args: [{ name: 'runId', type: 'string', required: true, description: 'runId del run (p. ej. run_marketing_...).' }],
  },
  {
    name: 'list_activities',
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
    description:
      'Estado de los cuatro arneses según sus heartbeats reales: conectado, ejecutando, último latido y si está stale (>60 s).',
    args: [],
  },
  {
    name: 'list_agents',
    description:
      'Agentes registrados en la sesión de orquestación actual (agentKey, nombre, rol y estado). No permite consultar otra sesión.',
    args: [],
  },
];

export function getAgentTool(name: string): AgentToolDef | null {
  return AGENT_TOOLS.find((tool) => tool.name === name) ?? null;
}
