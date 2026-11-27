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

function renderArgs(def: AgentToolDef): string {
  if (!def.args.length) return 'sin argumentos';
  return def.args
    .map((arg) => `${arg.name}: ${arg.type}${arg.required ? ', obligatorio' : ', opcional'} — ${arg.description}`)
    .join('; ');
}

/** Sección del system prompt con las tools disponibles y el formato exacto. */
export function buildToolInstructions(tools: AgentToolDef[]): string {
  if (!tools.length) return '';
  const list = tools.map((tool) => `- ${tool.name}(${renderArgs(tool)}) — ${tool.description}`).join('\n');
  const example = [
    '```tool',
    `{"tool":"${tools[0].name}","arguments":{}}`,
    '```',
  ].join('\n');

  return [
    'Herramientas de LECTURA disponibles (datos reales; no inventes su resultado):',
    list,
    '',
    'Cómo usarlas:',
    '- Si el usuario pide estado/datos reales, responde SOLO con un bloque de herramienta, sin texto antes ni después.',
    `Formato exacto (una herramienta por turno):`,
    example,
    '- Usa exactamente los nombres y argumentos listados. El servidor valida el bloque; si falta un argumento, no se ejecuta.',
    '- El servidor ejecutará la herramienta y te devolverá el resultado real; después responderás al usuario en lenguaje natural.',
    '- Nunca inventes cifras, estados, runIds ni resultados. Si la herramienta falla, dilo tal cual.',
    '- Estas herramientas son de lectura: no asignan actividades ni pausan/detienen agentes.',
  ].join('\n');
}

export function allAgentTools(): AgentToolDef[] {
  return AGENT_TOOLS;
}
