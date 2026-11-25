// Pruebas de statusBadge + eventAliases. Sin backend, sin red, sin secretos.
// Ejecutar: node --test script/   (Node >= 22.18)
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHandoffChain, deriveRunControl } from '../src/lib/handoffChain.ts';
import { deriveHarnesses } from '../src/lib/harnessStatus.ts';
import { normalizeEvents } from '../src/lib/eventAliases.ts';
import { toUiBadge, harnessBadge, originBadge, controlBadge, stepBadge } from '../src/lib/statusBadge.ts';

const T0 = Date.parse('2026-11-18T15:00:00.000Z');
let n = 0;
const ev = (type, payload, s = 0) => ({ _id: `x${++n}`, type, payload, createdAt: new Date(T0 + s * 1000).toISOString() });

// ---------- aliases ----------
test('cadena con nombres del SDD (acknowledged / task.completed / *Ref) queda completa', () => {
  const evs = [
    ev('support.report.received', { supportReportRef: 'TCK-1', isMock: false }, 0),
    ev('handoff.created', { handoffId: 'h1', ticketId: 'TCK-1', from: 'support', to: 'deepseek', isMock: false }, 5),
    ev('handoff.acknowledged', { handoffId: 'h1', isMock: false }, 8),
    ev('diagnosis.ready', { handoffId: 'h1', summary: 'ok', isMock: false }, 20),
    ev('patch.proposed', { handoffId: 'h1', pullRequestRef: 'PR#9', isMock: false }, 40),
    ev('approval.decided', { handoffId: 'h1', approvalStatus: 'approved', decidedBy: 'gerry', isMock: false }, 60),
    ev('task.completed', { handoffId: 'h1', status: 'completed', isMock: false }, 70),
  ];
  const v = deriveHandoffChain(normalizeEvents(evs));
  assert.equal(v.complete, true);
  assert.equal(v.hasMockData, false);
  assert.equal(v.steps[4].evidenceRef, 'PR#9');
  assert.match(v.steps[5].detail, /approved/);
});

test('sin normalizar, los nombres del SDD NO encajan (justifica el alias)', () => {
  const v = deriveHandoffChain([ev('handoff.created', { handoffId: 'h1' }), ev('handoff.acknowledged', { handoffId: 'h1' }, 3)]);
  assert.equal(v.steps[2].state, 'pending');
});

test('task.failed => run.result fallido', () => {
  const evs = normalizeEvents([ev('handoff.created', { handoffId: 'h1' }), ev('task.failed', { handoffId: 'h1' }, 5)]);
  const v = deriveHandoffChain(evs);
  assert.equal(v.steps[6].state, 'failed');
});

test('codeTaskId sirve como handoffId si falta', () => {
  const evs = normalizeEvents([ev('handoff.created', { codeTaskId: 'c1' }), ev('handoff.acknowledged', { codeTaskId: 'c1' }, 2)]);
  const v = deriveHandoffChain(evs);
  assert.equal(v.handoffId, 'c1');
  assert.equal(v.steps[2].state, 'done');
});

test('normalizar no muta el evento original ni toca los ya canónicos', () => {
  const orig = ev('handoff.acknowledged', { handoffId: 'h1' });
  const copy = JSON.stringify(orig);
  const [out] = normalizeEvents([orig]);
  assert.equal(JSON.stringify(orig), copy);
  assert.equal(out.type, 'handoff.ack');
  const canon = ev('handoff.ack', { handoffId: 'h1', ticketId: 't', prRef: 'p' });
  assert.equal(normalizeEvents([canon])[0], canon);
});

test('si trae prRef y pullRequestRef, gana prRef', () => {
  const [o] = normalizeEvents([ev('patch.proposed', { prRef: 'A', pullRequestRef: 'B' })]);
  assert.equal(o.payload.prRef, 'A');
});

// ---------- estados ----------
test('estados crudos de Convex y SDD mapean a un badge', () => {
  const cases = { queued: 'queued', spawning: 'queued', active: 'running', working: 'running', idle: 'connected', blocked: 'blocked', completed: 'completed', failed: 'failed', error: 'error', stopped: 'stopped', paused: 'paused', degraded: 'stale', cancelled: 'stopped' };
  for (const [raw, ui] of Object.entries(cases)) assert.equal(toUiBadge(raw).status, ui, raw);
});

test('estado desconocido NO se maquilla: unknown + valor crudo', () => {
  const b = toUiBadge('banana');
  assert.equal(b.status, 'unknown');
  assert.equal(b.raw, 'banana');
  assert.equal(toUiBadge(undefined).status, 'unknown');
  assert.equal(toUiBadge('  ').status, 'unknown');
});

test('mayúsculas y espacios se toleran', () => {
  assert.equal(toUiBadge(' RUNNING ').status, 'running');
});

// ---------- harness ----------
const NOW = T0;
const agent = (k, meta) => ({ agentKey: k, name: k, status: 'idle', meta });
const hv = (meta, key = 'support') => deriveHarnesses(meta === null ? [] : [agent(key, meta)], NOW).harnesses[0];

test('harness: prioridad sin registrar > error > stale > ejecutando > conectado > registrado', () => {
  assert.equal(harnessBadge(hv(null)).status, 'unregistered');
  assert.equal(harnessBadge(hv({ connected: true, executing: true }), 'error').status, 'error');
  const old = new Date(NOW - 120000).toISOString();
  assert.equal(harnessBadge(hv({ connected: true, executing: true, lastHeartbeatAt: old })).status, 'stale');
  assert.equal(harnessBadge(hv({ connected: true, executing: true })).status, 'running');
  assert.equal(harnessBadge(hv({ connected: true, executing: false })).status, 'connected');
  assert.equal(harnessBadge(hv({ connected: false })).status, 'registered');
});

test('harness con meta vacía: registrado + pista de conexión desconocida (no "conectado")', () => {
  const b = harnessBadge(hv({}));
  assert.equal(b.status, 'registered');
  assert.match(b.hint, /desconocido/);
});

// ---------- origen ----------
test('origen: mock visible, real y sin origen distintos; unknown NO es real', () => {
  assert.equal(originBadge('mock').label, 'MOCK');
  assert.equal(originBadge('real').label, 'REAL');
  const u = originBadge('unknown');
  assert.notEqual(u.label, 'REAL');
  assert.notEqual(u.tone, originBadge('real').tone);
});

// ---------- control ----------
const sent = (command, s = 0) => ev('agent.command.sent', { agentKey: 'support', command }, s);

test('control: Solicitado != Pausado/Detenido hasta confirmar', () => {
  assert.equal(controlBadge(deriveRunControl([sent('pause')], NOW + 3000)[0]).label, 'Solicitado');
  const ok = [sent('pause'), ev('agent.paused', { agentKey: 'support' }, 2)];
  assert.equal(controlBadge(deriveRunControl(ok, NOW + 3000)[0]).label, 'Pausado');
  const k = [sent('kill'), ev('agent.stopped', { agentKey: 'support' }, 2)];
  assert.equal(controlBadge(deriveRunControl(k, NOW + 3000)[0]).label, 'Detenido');
});

test('control: timeout se muestra como Sin confirmar (danger), no como éxito', () => {
  const b = controlBadge(deriveRunControl([sent('kill')], NOW + 60000)[0]);
  assert.equal(b.label, 'Sin confirmar');
  assert.equal(b.tone, 'danger');
});

test('eslabones: pending/done/failed', () => {
  assert.equal(stepBadge('pending').label, 'Pendiente');
  assert.equal(stepBadge('done').tone, 'success');
  assert.equal(stepBadge('failed').tone, 'danger');
});

// ---------- backend marca status 'stale' (getActiveConnections de Alejandro) ----------
test("status crudo 'stale' del backend se reconoce, no sale Desconocido", () => {
  assert.equal(toUiBadge('stale').status, 'stale');
});

test("harness: agent.status 'stale' + connected:false => Stale (no 'Registrado')", () => {
  const h = hv({ connected: false, executing: false, lastHeartbeatAt: new Date(NOW - 120000).toISOString() });
  assert.equal(harnessBadge(h, 'stale').status, 'stale');
  // sin el status del backend se queda como registrado sin conexión
  assert.equal(harnessBadge(h).status, 'registered');
});

// ---------- latido como epoch ms (forma real de getActiveConnections de Alejandro) ----------
test('latido numérico (epoch ms) viejo + conectado => stale y se normaliza a ISO', () => {
  const h = hv({ connected: true, executing: true, lastHeartbeatAt: NOW - 120000 });
  assert.equal(h.stale, true);
  assert.equal(h.lastHeartbeatAt, new Date(NOW - 120000).toISOString());
});

test('latido numérico reciente => no stale', () => {
  assert.equal(hv({ connected: true, lastHeartbeatAt: NOW - 5000 }).stale, false);
});

test('forma real del backend: status stale + connected:false + isMock => badge Stale, origen mock', () => {
  const meta = { connected: false, executing: false, harnessType: 'b2b', isMock: true, lastHeartbeatAt: NOW - 90000 };
  const h = deriveHarnesses([agent('b2b', meta)], NOW).harnesses.find((x) => x.key === 'b2b');
  assert.equal(h.registered, true);
  assert.equal(h.origin, 'mock');
  assert.equal(harnessBadge(h, 'stale').status, 'stale');
});
