import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TOOLS } from '../src/modules/agents/toolCatalog.ts';
import { buildToolInstructions, parseToolCall, stripToolBlocks } from '../src/modules/agents/toolProtocol.ts';

test('parseToolCall acepta un bloque válido', () => {
  const text = 'Claro.\n```tool\n{"tool":"run_overview","arguments":{"runId":"run_x"}}\n```';
  const parsed = parseToolCall(text);
  assert.equal(parsed.kind, 'call');
  if (parsed.kind !== 'call') return;
  assert.equal(parsed.call.tool, 'run_overview');
  assert.equal(parsed.call.args.runId, 'run_x');
});

test('parseToolCall ignora respuestas sin bloque', () => {
  assert.deepEqual(parseToolCall('hola, ¿qué necesitas?'), { kind: 'none' });
});

test('parseToolCall rechaza JSON inválido', () => {
  const parsed = parseToolCall('```tool\n{no-json}\n```');
  assert.equal(parsed.kind, 'invalid');
});

test('parseToolCall rechaza herramienta desconocida', () => {
  const parsed = parseToolCall('```tool\n{"tool":"borrar_todo","arguments":{}}\n```');
  assert.equal(parsed.kind, 'invalid');
});

test('parseToolCall exige argumentos obligatorios', () => {
  const parsed = parseToolCall('```tool\n{"tool":"run_overview","arguments":{}}\n```');
  assert.equal(parsed.kind, 'invalid');
});

test('parseToolCall acepta list_activities sin argumentos', () => {
  const parsed = parseToolCall('```tool\n{"tool":"list_activities"}\n```');
  assert.equal(parsed.kind, 'call');
});

test('stripToolBlocks quita el bloque y conserva el texto', () => {
  const text = 'Antes.\n```tool\n{"tool":"harness_health"}\n```\nDespués.';
  assert.equal(stripToolBlocks(text), 'Antes.\n\nDespués.');
});

test('buildToolInstructions lista todas las tools y el formato exacto', () => {
  const prompt = buildToolInstructions(AGENT_TOOLS);
  for (const tool of AGENT_TOOLS) {
    assert.ok(prompt.includes(tool.name), `falta ${tool.name}`);
  }
  assert.ok(prompt.includes('```tool'));
  assert.ok(prompt.toLowerCase().includes('no inventes'));
});
