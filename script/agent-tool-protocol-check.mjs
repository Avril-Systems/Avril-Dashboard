import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_TOOLS,
  isToolAllowedForAgent,
  isWriteTool,
  toolsForAgent,
} from '../src/modules/agents/toolCatalog.ts';
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

test('toolsForAgent: orquestador ve todas; arnés solo list/assign', () => {
  const orchestrator = toolsForAgent(null).map((t) => t.name).sort();
  const support = toolsForAgent('support').map((t) => t.name).sort();
  assert.deepEqual(orchestrator, AGENT_TOOLS.map((t) => t.name).sort());
  assert.deepEqual(support, [
    'assign_activity',
    'get_activity_result',
    'get_my_intention',
    'list_activities',
    'set_my_intention',
  ]);
});

test('isToolAllowedForAgent bloquea tools de orquestador en un arnés', () => {
  assert.equal(isToolAllowedForAgent('run_overview', 'marketing'), false);
  assert.equal(isToolAllowedForAgent('request_control', 'marketing'), false);
  assert.equal(isToolAllowedForAgent('list_activities', 'marketing'), true);
  assert.equal(isToolAllowedForAgent('assign_activity', 'marketing'), true);
  assert.equal(isToolAllowedForAgent('get_activity_result', 'marketing'), true);
  assert.equal(isToolAllowedForAgent('get_my_intention', 'marketing'), true);
  assert.equal(isToolAllowedForAgent('set_my_intention', 'marketing'), true);
  assert.equal(isToolAllowedForAgent('set_strategy', 'marketing'), false);
  assert.equal(isToolAllowedForAgent('set_harness_intention', 'marketing'), false);
  assert.equal(isToolAllowedForAgent('run_overview', null), true);
});

test('buildToolInstructions oculta harnessType y declara el alcance', () => {
  const prompt = buildToolInstructions(toolsForAgent('support'), { harnessType: 'support' });
  assert.match(prompt, /Alcance: solo tu arnés/);
  assert.doesNotMatch(prompt, /harnessType:/);
});

test('describeToolProposal usa el arnés inyectado en la propuesta', () => {
  const summary = describeToolProposal({
    tool: 'assign_activity',
    args: { harnessType: 'prospecting', activity: 'github_discovery', input: { queries: 'topic:mcp', maxCandidates: 5 } },
  });
  assert.match(summary, /prospecting/);
  assert.match(summary, /github_discovery/);
  assert.match(summary, /maxCandidates/);
});

test('parseToolCall acepta get_activity_result con activityId', () => {
  const parsed = parseToolCall('```tool\n{"tool":"get_activity_result","arguments":{"activityId":"act_123"}}\n```');
  assert.equal(parsed.kind, 'call');
  if (parsed.kind !== 'call') return;
  assert.equal(parsed.call.tool, 'get_activity_result');
  assert.equal(parsed.call.args.activityId, 'act_123');
});

test('get_activity_result exige activityId', () => {
  assert.equal(parseToolCall('```tool\n{"tool":"get_activity_result","arguments":{}}\n```').kind, 'invalid');
});

test('parseToolCall acepta set_strategy con particulares', () => {
  const parsed = parseToolCall(
    '```tool\n{"tool":"set_strategy","arguments":{"strategic":"Validar demanda B2B","harnessIntentions":[{"harnessType":"b2b","body":"Conseguir 5 leads"}]}}\n```'
  );
  assert.equal(parsed.kind, 'call');
  if (parsed.kind !== 'call') return;
  assert.equal(parsed.call.tool, 'set_strategy');
  assert.equal(parsed.call.args.strategic, 'Validar demanda B2B');
});

test('set_harness_intention exige harnessType y body', () => {
  assert.equal(parseToolCall('```tool\n{"tool":"set_harness_intention","arguments":{"harnessType":"b2b"}}\n```').kind, 'invalid');
  assert.equal(
    parseToolCall('```tool\n{"tool":"set_harness_intention","arguments":{"harnessType":"b2b","body":"X"}}\n```').kind,
    'call'
  );
});

test('describeToolProposal resume una estrategia', () => {
  const summary = describeToolProposal({
    tool: 'set_strategy',
    args: {
      strategic: 'Validar demanda B2B',
      harnessIntentions: [{ harnessType: 'b2b', body: 'Conseguir 5 leads' }],
    },
  });
  assert.match(summary, /Validar demanda B2B/);
  assert.match(summary, /b2b: Conseguir 5 leads/);
});
