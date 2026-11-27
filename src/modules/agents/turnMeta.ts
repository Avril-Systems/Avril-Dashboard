/**
 * Metacognición del turno (S06).
 *
 * Cada respuesta de agente declara, sin adornos:
 *   - qué fuentes reales se consultaron,
 *   - con qué herramientas,
 *   - qué confianza tiene la respuesta,
 *   - qué no se sabe o no se ejecutó.
 *
 * Lógica PURA y segura para cliente (no importa Convex ni servidor).
 */

export type TurnConfidence = 'high' | 'medium' | 'low';

export type TurnTool = { tool: string; ok: boolean; error?: string };

export type TurnIntent = { kind: string; tool?: string; reason?: string };

export type TurnMeta = {
  confidence: TurnConfidence;
  sources: string[];
  tools: TurnTool[];
  intent?: TurnIntent;
  unknowns: string[];
  generatedAt: string;
};

export type BuildTurnMetaInput = {
  intent?: TurnIntent | null;
  tools?: TurnTool[];
  /** true cuando una acción de escritura se ejecutó tras confirmación. */
  executed?: boolean;
  /** true cuando hay una propuesta de escritura pendiente de confirmación. */
  proposal?: boolean;
  /** respuesta simulada (mock dev). */
  mock?: boolean;
  extraUnknowns?: string[];
  now?: string;
};

const SOURCES: Record<string, string> = {
  run_overview: 'Swarmy · orchestratorEvents + harnessActivities',
  list_activities: 'Swarmy · harnessActivities',
  harness_health: 'Swarmy · orchestratorConnections (heartbeats)',
  list_agents: 'Convex · orchestrationAgents',
  assign_activity: 'Swarmy · harnessActivities (cola durable)',
  request_control: 'Swarmy · orchestratorEvents (agent.command.sent)',
};

export function buildTurnMeta(input: BuildTurnMetaInput = {}): TurnMeta {
  const tools = input.tools ?? [];
  const executedTools = tools.filter((tool) => tool.ok);

  const sources: string[] = [];
  for (const tool of executedTools) {
    const source = SOURCES[tool.tool];
    if (source && !sources.includes(source)) sources.push(source);
  }

  const unknowns: string[] = [];
  const pushUnknown = (value: string) => {
    if (value && !unknowns.includes(value)) unknowns.push(value);
  };

  if (input.mock) pushUnknown('Respuesta MOCK: no valida ningún backend real.');

  if (input.proposal) pushUnknown('La acción no se ha ejecutado; requiere confirmación del operador.');

  if (!tools.length && !input.proposal && !input.mock) {
    pushUnknown('No se consultó estado real en este turno (sin herramienta).');
  }

  for (const tool of tools) {
    if (!tool.ok) pushUnknown(`La herramienta ${tool.tool} falló: ${tool.error ?? 'error desconocido'}`);
  }

  for (const extra of input.extraUnknowns ?? []) pushUnknown(extra);

  let confidence: TurnConfidence;
  if (input.mock) confidence = 'low';
  else if (executedTools.length > 0) confidence = 'high';
  else if (tools.length > 0) confidence = 'low';
  else confidence = 'medium';

  return {
    confidence,
    sources,
    tools,
    ...(input.intent ? { intent: input.intent } : {}),
    unknowns,
    generatedAt: input.now ?? new Date().toISOString(),
  };
}
