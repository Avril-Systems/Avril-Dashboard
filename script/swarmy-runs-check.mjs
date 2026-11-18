// Pruebas de swarmyRuns.groupRuns. Sin red ni secretos. Ejecutar: node --test script/swarmy-runs-check.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRuns } from '../src/lib/swarmyRuns.ts';

const T0 = Date.parse('2026-11-18T15:00:00.000Z');
const ev = (type, runId, s, payload) => ({ type, runId, payload, createdAt: new Date(T0 + s * 1000).toISOString() });

test('agrupa por runId y cuenta eventos', () => {
  const r = groupRuns([ev('a', 'r1', 0), ev('b', 'r1', 5), ev('a', 'r2', 2)]);
  assert.equal(r.length, 2);
  assert.equal(r.find((x) => x.runId === 'r1').eventCount, 2);
});

test('ordena por actividad más reciente primero', () => {
  const r = groupRuns([ev('a', 'viejo', 0), ev('a', 'nuevo', 100)]);
  assert.deepEqual(r.map((x) => x.runId), ['nuevo', 'viejo']);
});

test('lastType y fechas salen del evento más reciente aunque lleguen desordenados', () => {
  const r = groupRuns([ev('ultimo', 'r1', 50), ev('primero', 'r1', 1)])[0];
  assert.equal(r.lastType, 'ultimo');
  assert.equal(r.firstAt, new Date(T0 + 1000).toISOString());
});

test('hasMock solo si algún payload trae isMock:true', () => {
  assert.equal(groupRuns([ev('a', 'r1', 0, { isMock: false })])[0].hasMock, false);
  assert.equal(groupRuns([ev('a', 'r1', 0), ev('b', 'r1', 1, { isMock: true })])[0].hasMock, true);
});

test('blocked solo con error.reported y status BLOCKED', () => {
  assert.equal(groupRuns([ev('error.reported', 'r1', 0, { status: 'BLOCKED' })])[0].blocked, true);
  assert.equal(groupRuns([ev('error.reported', 'r1', 0, { message: 'x' })])[0].blocked, false);
  assert.equal(groupRuns([ev('handoff.created', 'r1', 0, { status: 'BLOCKED' })])[0].blocked, false);
});

test('eventos sin runId se ignoran; lista vacía no revienta', () => {
  assert.equal(groupRuns([ev('a', undefined, 0), ev('a', '  ', 1)]).length, 0);
  assert.deepEqual(groupRuns([]), []);
});

test('hasReal solo si algún payload trae isMock:false explícito', () => {
  assert.equal(groupRuns([ev('a', 'r1', 0)])[0].hasReal, false);
  assert.equal(groupRuns([ev('a', 'r1', 0, { isMock: true })])[0].hasReal, false);
  assert.equal(groupRuns([ev('a', 'r1', 0, { isMock: false })])[0].hasReal, true);
  const mixed = groupRuns([ev('a', 'r1', 0, { isMock: true }), ev('b', 'r1', 1, { isMock: false })])[0];
  assert.equal(mixed.hasMock && mixed.hasReal, true);
});
