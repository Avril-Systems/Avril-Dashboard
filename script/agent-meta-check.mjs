import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnMeta } from '../src/modules/agents/turnMeta.ts';

const now = '2026-11-27T00:00:00.000Z';

test('tool de lectura ok -> confianza alta y fuente real', () => {
  const meta = buildTurnMeta({ tools: [{ tool: 'list_activities', ok: true }], now });
  assert.equal(meta.confidence, 'high');
  assert.deepEqual(meta.sources, ['Swarmy · harnessActivities']);
  assert.equal(meta.unknowns.length, 0);
  assert.equal(meta.generatedAt, now);
});

test('dos tools comparten fuente y se deduplica', () => {
  const meta = buildTurnMeta({
    tools: [
      { tool: 'run_overview', ok: true },
      { tool: 'list_activities', ok: true },
    ],
    now,
  });
  assert.equal(meta.sources.length, 2);
  assert.equal(meta.confidence, 'high');
});

test('tool fallida -> confianza baja y límite explícito', () => {
  const meta = buildTurnMeta({ tools: [{ tool: 'harness_health', ok: false, error: 'sin config' }], now });
  assert.equal(meta.confidence, 'low');
  assert.deepEqual(meta.sources, []);
  assert.ok(meta.unknowns.some((u) => u.includes('harness_health')));
});

test('sin tool -> confianza media y aviso de que no se consultó', () => {
  const meta = buildTurnMeta({ now });
  assert.equal(meta.confidence, 'medium');
  assert.ok(meta.unknowns.some((u) => u.includes('No se consultó estado real')));
});

test('propuesta -> aviso de confirmación pendiente', () => {
  const meta = buildTurnMeta({
    proposal: true,
    intent: { kind: 'proposal', tool: 'assign_activity' },
    now,
  });
  assert.ok(meta.unknowns.some((u) => u.includes('requiere confirmación')));
  assert.equal(meta.confidence, 'medium');
});

test('mock -> confianza baja y marcado como simulado', () => {
  const meta = buildTurnMeta({ mock: true, now });
  assert.equal(meta.confidence, 'low');
  assert.ok(meta.unknowns.some((u) => u.includes('MOCK')));
});

test('acción confirmada -> confianza alta con fuente de la acción', () => {
  const meta = buildTurnMeta({ tools: [{ tool: 'assign_activity', ok: true }], executed: true, now });
  assert.equal(meta.confidence, 'high');
  assert.deepEqual(meta.sources, ['Swarmy · harnessActivities (cola durable)']);
});

test('get_activity_result declara la fuente del resultado', () => {
  const meta = buildTurnMeta({ tools: [{ tool: 'get_activity_result', ok: true }], now });
  assert.equal(meta.confidence, 'high');
  assert.deepEqual(meta.sources, ['Swarmy · harnessActivities.result']);
});
