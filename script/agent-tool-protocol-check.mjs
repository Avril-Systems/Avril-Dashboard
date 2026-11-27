import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TOOLS, isWriteTool } from '../src/modules/agents/toolCatalog.ts';
import { buildToolInstructions, describeToolProposal, parseToolCall, stripToolBlocks } from '../src/modules/agents/toolProtocol.ts';

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

test('parseToolCall acepta assign_activity con input', () => {
  const parsed = parseToolCall(
    '```tool\n{"tool":"assign_activity","arguments":{"harnessType":"support","activity":"incident_triage","input":{"lookbackHours":24}}}\n```'
  );
  assert.equal(parsed.kind, 'call');
  if (parsed.kind !== 'call') return;
  assert.equal(parsed.call.tool, 'assign_activity');
  assert.deepEqual(parsed.call.args.input, { lookbackHours: 24 });
});

test('parseToolCall exige args de request_control', () => {
  assert.equal(parseToolCall('```tool\n{"tool":"request_control","arguments":{"runId":"r1"}}\n```').kind, 'invalid');
  assert.equal(
    parseToolCall('```tool\n{"tool":"request_control","arguments":{"runId":"r1","agentKey":"a1","command":"pause"}}\n```').kind,
    'call'
  );
});

test('describeToolProposal resume una asignación real', () => {
  const summary = describeToolProposal({
    tool: 'assign_activity',
    args: { harnessType: 'support', activity: 'incident_triage', input: { lookbackHours: 24 } },
  });
  assert.match(summary, /incident_triage/);
  assert.match(summary, /support/);
  assert.match(summary, /lookbackHours/);
});

test('describeToolProposal aclara que pause es solicitud', () => {
  const summary = describeToolProposal({
    tool: 'request_control',
    args: { runId: 'run_1', agentKey: 'sw1', command: 'pause' },
  });
  assert.match(summary, /PAUSE/);
  assert.match(summary, /solicitud/i);
});

test('isWriteTool distingue lectura de escritura', () => {
  assert.equal(isWriteTool('run_overview'), false);
  assert.equal(isWriteTool('assign_activity'), true);
  assert.equal(isWriteTool('request_control'), true);
});

test('buildToolInstructions separa lectura y escritura', () => {
  const prompt = buildToolInstructions(AGENT_TOOLS);
  assert.match(prompt, /LECTURA/);
  assert.match(prompt, /ESCRITURA/);
  assert.match(prompt, /confirmación/i);
});
