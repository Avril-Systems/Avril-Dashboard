/**
 * Protocolo de herramientas del orquestador (S02a).
 *
 * Venice no soporta function calling nativo (verificado: `tools` + `tool_choice:auto`
 * devuelve `tool_calls: null`). Por eso el contrato es un bloque explícito:
 *
 *   ```tool
 *   {"tool":"run_overview","arguments":{"runId":"run_..."}}
 *   ```
 *
 * El servidor parsea y valida el bloque ANTES de ejecutar nada. Si el bloque no es
 * válido, no se ejecuta y el error se trata como texto honesto (nunca se inventa
 * el resultado). Lógica pura y compatible con Node type stripping.
 */
import { AGENT_TOOLS, getAgentTool } from './toolCatalog.ts';
import type { AgentToolDef, AgentToolName } from './toolCatalog.ts';

export type ToolCall = { tool: AgentToolName; args: Record<string, unknown> };

export type ParseToolResult =
  | { kind: 'none' }
  | { kind: 'invalid'; error: string }
  | { kind: 'call'; call: ToolCall };

const TOOL_BLOCK = /```tool[ \t]*\r?\n([\s\S]*?)```/i;

function invalid(error: string): ParseToolResult {
  return { kind: 'invalid', error };
}

export function parseToolCall(rawText: string): ParseToolResult {
  const match = TOOL_BLOCK.exec(String(rawText ?? ''));
  if (!match) return { kind: 'none' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return invalid('El bloque de herramienta no contiene JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('El bloque de herramienta debe ser un objeto JSON.');
  }

  const record = parsed as Record<string, unknown>;
  const name = record.tool;
  if (typeof name !== 'string' || !name.trim()) {
    return invalid('El bloque de herramienta no incluye "tool".');
  }

  const def = getAgentTool(name.trim());
  if (!def) return invalid(`Herramienta desconocida: ${name}.`);

  const argsRaw = record.arguments ?? record.args ?? {};
  if (argsRaw !== null && (typeof argsRaw !== 'object' || Array.isArray(argsRaw))) {
    return invalid('"arguments" debe ser un objeto JSON.');
  }
  const args = (argsRaw ?? {}) as Record<string, unknown>;

  for (const arg of def.args) {
    const value = args[arg.name];
    const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim());
    if (arg.required && empty) return invalid(`Falta el argumento obligatorio "${arg.name}".`);
  }

  return { kind: 'call', call: { tool: def.name, args } };
}

/** Quita los bloques de herramienta antes de mostrar/persistir la respuesta. */
export function stripToolBlocks(rawText: string): string {
  return String(rawText ?? '')
    .replace(/```tool[ \t]*\r?\n[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderArgs(def: AgentToolDef, harnessType?: string | null): string {
  const args = harnessType ? def.args.filter((arg) => arg.name !== 'harnessType') : def.args;
  if (!args.length) return 'sin argumentos';
  return args
    .map((arg) => `${arg.name}: ${arg.type}${arg.required ? ', obligatorio' : ', opcional'} — ${arg.description}`)
    .join('; ');
}

/** Resumen determinista de una propuesta de escritura (se muestra antes de confirmar). */
export function describeToolProposal(call: ToolCall): string {
  const args = call.args;

  switch (call.tool) {
    case 'assign_activity': {
      const harness = typeof args.harnessType === 'string' ? args.harnessType : '?';
      const activity = typeof args.activity === 'string' ? args.activity : '?';
      const title = typeof args.title === 'string' && args.title.trim() ? ` · título: ${args.title.trim()}` : '';
      const input =
        args.input !== undefined ? `\n- Input: ${JSON.stringify(args.input).slice(0, 800)}` : '\n- Input: (defaults del catálogo)';
      return `Asignar la actividad \`${activity}\` al arnés \`${harness}\`${title}.${input}`;
    }
    case 'request_control': {
      const runId = typeof args.runId === 'string' ? args.runId : '?';
      const agentKey = typeof args.agentKey === 'string' ? args.agentKey : '?';
      const command = args.command === 'kill' ? 'STOP (kill)' : 'PAUSE';
      return `Solicitar ${command} para \`${agentKey}\` en el run \`${runId}\` (solicitud; no es confirmación).`;
    }
    default:
      return `Ejecutar \`${call.tool}\` con args ${JSON.stringify(args).slice(0, 500)}.`;
  }
}

/** Sección del system prompt con las tools disponibles y el formato exacto. */
export function buildToolInstructions(
  tools: AgentToolDef[],
  options: { harnessType?: string | null } = {}
): string {
  if (!tools.length) return '';

  const readTools = tools.filter((tool) => tool.kind === 'read');
  const writeTools = tools.filter((tool) => tool.kind === 'write');
  const exampleTool = readTools[0] ?? writeTools[0];
  const example = [
    '```tool',
    `{"tool":"${exampleTool.name}","arguments":{}}`,
    '```',
  ].join('\n');

  const sections = [
    'Herramientas disponibles (datos y acciones reales; no inventes resultados):',
  ];

  if (options.harnessType) {
    sections.push(
      '',
      `Alcance: solo tu arnés \`${options.harnessType}\`. No puedes consultar ni asignar actividades de otros arneses.`
    );
  }

  if (readTools.length) {
    sections.push(
      '',
      'LECTURA (se ejecutan en tu turno):',
      readTools.map((tool) => `- ${tool.name}(${renderArgs(tool, options.harnessType)}) — ${tool.description}`).join('\n')
    );
  }

  if (writeTools.length) {
    sections.push(
      '',
      'ESCRITURA (requieren confirmación explícita del operador; el servidor NO las ejecuta en tu turno):',
      writeTools.map((tool) => `- ${tool.name}(${renderArgs(tool, options.harnessType)}) — ${tool.description}`).join('\n')
    );
  }

  sections.push(
    '',
    'Cómo usarlas:',
    '- Si el usuario pide estado/datos reales, responde SOLO con un bloque de herramienta, sin texto antes ni después.',
    'Formato exacto (una herramienta por turno):',
    example,
    '- Usa exactamente los nombres y argumentos listados. El servidor valida el bloque; si falta un argumento, no se ejecuta.',
    '- Las de LECTURA se ejecutan y te devuelven el dato real; después responderás al usuario en lenguaje natural.',
    '- Si el usuario pide ejecutar, preparar o encolar una actividad, usa `assign_activity`. Usa `list_activities` solo para consultar estado.',
    '- Usa `get_activity_result` solo para UNA actividad concreta (interpretar qué encontró); no cargues todos los resultados.',
    '- Las de ESCRITURA NO se ejecutan: el servidor devuelve una propuesta y el operador la confirma en la UI. Nunca digas que ya se ejecutó.',
    '- Nunca inventes cifras, estados, runIds ni resultados. Si la herramienta falla, dilo tal cual.',
    '- Para acciones destructivas (kill/stop) o que crean runs, explica qué hará la propuesta y deja que el operador confirme.'
  );

  return sections.join('\n');
}

export function allAgentTools(): AgentToolDef[] {
  return AGENT_TOOLS;
}
