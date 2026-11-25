// Pruebas de la lógica pura de Agent Office S00. Sin backend, sin red, sin secretos.
// Ejecutar: node --test script/chain-logic-check.mjs   (Node >= 22.18)
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHandoffChain, deriveRunControl } from '../src/lib/handoffChain.ts';
import { deriveHarnesses } from '../src/lib/harnessStatus.ts';

const T0 = Date.parse('2026-11-13T15:00:00.000Z');
let n = 0;
const ev = (type, payload, offsetSec = 0) => ({
  _id: `e${++n}`,
  type,
  payload,
  createdAt: new Date(T0 + offsetSec * 1000).toISOString(),
});
const H = 'h-001';

function fullChain(extra = {}) {
  return [
    ev('support.report.received', { ticketId: 'LAB-20261112-AB12', severity: 'high', isMock: true }, 0),
    ev('handoff.created', { handoffId: H, ticketId: 'LAB-20261112-AB12', from: 'support', to: 'deepseek', isMock: true }, 5),
    ev('handoff.ack', { handoffId: H, ackAt: '2026-11-13T15:00:08Z', isMock: true }, 8),
    ev('diagnosis.ready', { handoffId: H, summary: 'Caddy no recarga', evidenceRef: 'diagnosis.md', isMock: true }, 20),
    ev('patch.proposed', { handoffId: H, prRef: 'PR#42', isMock: true }, 40),
    ev('approval.decided', { handoffId: H, decision: 'approved', decidedBy: 'kevin', isMock: true }, 60),
    ev('run.result', { handoffId: H, outcome: 'ok', isMock: true, ...extra }, 70),
  ];
}

test('cadena completa: 7 eslabones done, marcada como mock', () => {
  const v = deriveHandoffChain(fullChain());
  assert.equal(v.steps.length, 7);
  assert.ok(v.steps.every((s) => s.state === 'done'));
  assert.equal(v.complete, true);
  assert.equal(v.hasMockData, true);
  assert.equal(v.handoffId, H);
  assert.equal(v.steps[3].evidenceRef, 'diagnosis.md');
});

test('cadena parcial: lo que no existe queda pending, no se inventa', () => {
  const v = deriveHandoffChain(fullChain().slice(0, 3));
  assert.deepEqual(v.steps.map((s) => s.state), ['done', 'done', 'done', 'pending', 'pending', 'pending', 'pending']);
  assert.equal(v.complete, false);
});

test('sin ningún evento: todo pending y sin bloqueo', () => {
  const v = deriveHandoffChain([]);
  assert.ok(v.steps.every((s) => s.state === 'pending'));
  assert.equal(v.blocked, undefined);
});

test('duplicados del WS manager (misma carga, <2 s) se colapsan', () => {
  const evs = fullChain();
  evs.push({ ...evs[2], _id: 'dup', createdAt: new Date(T0 + 8500).toISOString() });
  const v = deriveHandoffChain(evs);
  assert.equal(v.steps[2].state, 'done');
  assert.equal(v.errors.length, 0);
});

test('error.reported sobre un eslabón lo marca failed y expone bloqueo legible', () => {
  const evs = fullChain().slice(0, 3);
  evs.push(ev('error.reported', { handoffId: H, step: 'diagnosis.ready', message: 'DeepSeek no respondió', recoverable: true, isMock: true }, 30));
  const v = deriveHandoffChain(evs);
  assert.equal(v.steps[3].state, 'failed');
  assert.equal(v.blocked?.message, 'DeepSeek no respondió');
  assert.equal(v.errors[0].recoverable, true);
});

test('error sin mensaje no revienta: texto por defecto', () => {
  const v = deriveHandoffChain([...fullChain().slice(0, 2), ev('error.reported', { step: 'handoff.ack' }, 9)]);
  assert.equal(v.errors[0].message, 'Error sin detalle');
});

test('run.result con outcome failed => failed', () => {
  const v = deriveHandoffChain(fullChain({ outcome: 'failed' }));
  assert.equal(v.steps[6].state, 'failed');
  assert.equal(v.complete, false);
});

test('aprobación rechazada se muestra en el detalle', () => {
  const evs = fullChain();
  evs[5] = ev('approval.decided', { handoffId: H, decision: 'rejected', decidedBy: 'kevin', isMock: true }, 60);
  const v = deriveHandoffChain(evs);
  assert.match(v.steps[5].detail, /rejected/);
});

test('con dos handoffs se muestra el último y se ignoran eventos del anterior', () => {
  const old = [
    ev('handoff.created', { handoffId: 'old', from: 'support', to: 'deepseek' }, -100),
    ev('handoff.ack', { handoffId: 'old' }, -90),
  ];
  const v = deriveHandoffChain([...old, ...fullChain().slice(0, 2)]);
  assert.equal(v.handoffId, H);
  assert.equal(v.steps[2].state, 'pending');
});

test('origen: isMock ausente => unknown (no se asume real)', () => {
  const v = deriveHandoffChain([ev('support.report.received', { ticketId: 'X' }), ev('handoff.created', { handoffId: H })]);
  assert.equal(v.steps[0].origin, 'unknown');
  assert.equal(v.hasMockData, false);
});

test('isMock:false => real', () => {
  const v = deriveHandoffChain([ev('handoff.created', { handoffId: H, isMock: false })]);
  assert.equal(v.steps[1].origin, 'real');
});

test('eslabón posterior sin el anterior genera advertencia', () => {
  const v = deriveHandoffChain([ev('handoff.created', { handoffId: H }), ev('diagnosis.ready', { handoffId: H, summary: 's' }, 5)]);
  assert.ok(v.warnings.some((w) => /Diagnóstico registrado sin ACK/.test(w)));
});

// ---- pausa / stop ----
const sent = (command, offsetSec = 0, agentKey = 'support') => ev('agent.command.sent', { agentKey, command }, offsetSec);

test('pausa enviada sin confirmación: sent_unconfirmed y luego timeout', () => {
  const evs = [sent('pause')];
  assert.equal(deriveRunControl(evs, T0 + 5000)[0].state, 'sent_unconfirmed');
  assert.equal(deriveRunControl(evs, T0 + 20000)[0].state, 'unconfirmed_timeout');
});

test('agent.paused posterior confirma la pausa', () => {
  const evs = [sent('pause'), ev('agent.paused', { agentKey: 'support', isMock: true }, 3)];
  const c = deriveRunControl(evs, T0 + 5000)[0];
  assert.equal(c.state, 'confirmed');
  assert.equal(c.origin, 'mock');
});

test('agent.status "paused" del gateway también confirma', () => {
  const evs = [sent('pause'), ev('agent.status', { agentId: 'support', status: 'paused' }, 2)];
  assert.equal(deriveRunControl(evs, T0 + 5000)[0].state, 'confirmed');
});

test('confirmación de OTRO agente no cuenta', () => {
  const evs = [sent('pause'), ev('agent.paused', { agentKey: 'b2b' }, 2)];
  assert.equal(deriveRunControl(evs, T0 + 5000)[0].state, 'sent_unconfirmed');
});

test('confirmación ANTERIOR al comando no cuenta', () => {
  const evs = [ev('agent.paused', { agentKey: 'support' }, -10), sent('pause', 0)];
  assert.equal(deriveRunControl(evs, T0 + 5000)[0].state, 'sent_unconfirmed');
});

test('kill se confirma con agent.stopped, no con agent.paused', () => {
  const k = [sent('kill'), ev('agent.paused', { agentKey: 'support' }, 1)];
  assert.equal(deriveRunControl(k, T0 + 5000)[0].state, 'sent_unconfirmed');
  const ok = [sent('kill'), ev('agent.stopped', { agentKey: 'support' }, 1)];
  assert.equal(deriveRunControl(ok, T0 + 5000)[0].state, 'confirmed');
});

// ---- harnesses ----
const agent = (agentKey, meta) => ({ agentKey, name: agentKey, status: 'idle', meta });

test('4 harnesses esperados: los no registrados salen registered=false', () => {
  const { harnesses } = deriveHarnesses([agent('support', { connected: true, executing: false })], T0);
  assert.equal(harnesses.length, 4);
  assert.equal(harnesses[0].registered, true);
  assert.equal(harnesses.filter((h) => !h.registered).length, 3);
  assert.equal(harnesses[1].connected, false);
});

test('registrado, conectado y ejecutando son independientes', () => {
  const { harnesses } = deriveHarnesses([agent('support', { connected: true, executing: false })], T0);
  const h = harnesses[0];
  assert.deepEqual([h.registered, h.connected, h.executing], [true, true, false]);
});

test('meta sin datos => null (desconocido), no false', () => {
  const { harnesses } = deriveHarnesses([agent('support', {})], T0);
  assert.equal(harnesses[0].connected, null);
  assert.equal(harnesses[0].executing, null);
});

test('heartbeat viejo marca stale solo si está conectado', () => {
  const old = new Date(T0 - 120000).toISOString();
  const a = deriveHarnesses([agent('support', { connected: true, lastHeartbeatAt: old })], T0).harnesses[0];
  const b = deriveHarnesses([agent('support', { connected: false, lastHeartbeatAt: old })], T0).harnesses[0];
  assert.equal(a.stale, true);
  assert.equal(b.stale, false);
});

test('harnessType en meta tiene prioridad y agentes ajenos se cuentan aparte', () => {
  const r = deriveHarnesses([agent('xyz-1', { harnessType: 'b2b', connected: true }), agent('otro', {})], T0);
  assert.equal(r.harnesses[1].registered, true);
  assert.equal(r.harnesses[1].agentKey, 'xyz-1');
  assert.equal(r.unmatchedAgents, 1);
});

test('origen mock del harness', () => {
  const h = deriveHarnesses([agent('support', { isMock: true })], T0).harnesses[0];
  assert.equal(h.origin, 'mock');
});
