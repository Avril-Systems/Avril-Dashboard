import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent } from '../src/modules/agents/intent.ts';

test('pregunta por actividades -> list_activities', () => {
  const intent = detectIntent('¿Cuántas actividades hay y en qué estados?');
  assert.equal(intent.kind, 'read');
  if (intent.kind !== 'read') return;
  assert.equal(intent.tool, 'list_activities');
});

test('list_activities filtra por arnés', () => {
  const intent = detectIntent('Muéstrame las actividades de marketing');
  assert.equal(intent.kind, 'read');
  if (intent.kind !== 'read') return;
  assert.equal(intent.tool, 'list_activities');
  assert.equal(intent.args.harnessType, 'marketing');
});

test('run con estado -> run_overview', () => {
  const intent = detectIntent('Dame el estado del run run_support_abc123');
  assert.equal(intent.kind, 'read');
  if (intent.kind !== 'read') return;
  assert.equal(intent.tool, 'run_overview');
  assert.equal(intent.args.runId, 'run_support_abc123');
});

test('salud de arneses -> harness_health', () => {
  const intent = detectIntent('¿Están conectados los arneses?');
  assert.equal(intent.kind, 'read');
  if (intent.kind !== 'read') return;
  assert.equal(intent.tool, 'harness_health');
});

test('agentes de la sesión -> list_agents', () => {
  const intent = detectIntent('¿Qué agentes hay en la sesión?');
  assert.equal(intent.kind, 'read');
  if (intent.kind !== 'read') return;
  assert.equal(intent.tool, 'list_agents');
});

test('asignar incident_triage -> propuesta con input', () => {
  const intent = detectIntent('Asigna la actividad incident_triage al arnés support con lookbackHours 24');
  assert.equal(intent.kind, 'proposal');
  if (intent.kind !== 'proposal') return;
  assert.equal(intent.tool, 'assign_activity');
  assert.deepEqual(intent.args.harnessType, 'support');
  assert.deepEqual(intent.args.activity, 'incident_triage');
  assert.deepEqual(intent.args.input, { lookbackHours: 24 });
});

test('asignar campaña -> marketing_campaign', () => {
  const intent = detectIntent('Asigna una campaña de marketing');
  assert.equal(intent.kind, 'proposal');
  if (intent.kind !== 'proposal') return;
  assert.equal(intent.args.harnessType, 'marketing');
  assert.equal(intent.args.activity, 'marketing_campaign');
});

test('ticket sin input no se auto-propone', () => {
  assert.equal(detectIntent('Asigna un ticket de soporte').kind, 'none');
});

test('pausa con agente y run -> request_control', () => {
  const intent = detectIntent('Pausa el agente `swarm-strategy` en el run run_support_abc');
  assert.equal(intent.kind, 'control');
  if (intent.kind !== 'control') return;
  assert.deepEqual(intent.args, {
    runId: 'run_support_abc',
    agentKey: 'swarm-strategy',
    command: 'pause',
  });
});

test('kill con agente y run -> request_control kill', () => {
  const intent = detectIntent('kill `sw1-research` en el run run_marketing_xyz');
  assert.equal(intent.kind, 'control');
  if (intent.kind !== 'control') return;
  assert.equal(intent.args.command, 'kill');
});

test('pausa sin agente -> none (no adivinar)', () => {
  assert.equal(detectIntent('Pausa el run run_support_abc').kind, 'none');
});

test('conversación normal -> none', () => {
  assert.equal(detectIntent('Hola, ¿cómo estás?').kind, 'none');
});
