import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHarnessIntentions } from '../src/modules/agents/intentionArgs.ts';

const MAP = {
  b2b: 'Clasificar solicitudes y preparar borradores.',
  marketing: 'Producir contenido de validación.',
  prospecting: 'Descubrir y verificar leads.',
  support: 'Detectar señales de demanda.',
};

test('normaliza el mapa observado en producción', () => {
  const result = normalizeHarnessIntentions(MAP);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map((item) => item.harnessType).sort(), ['b2b', 'marketing', 'prospecting', 'support']);
  assert.equal(result.find((item) => item.harnessType === 'support')?.body, MAP.support);
});

test('normaliza el array canónico', () => {
  const result = normalizeHarnessIntentions([
    { harnessType: 'support', body: 'Detectar demanda.' },
    { harnessType: 'b2b', body: 'Clasificar solicitudes.' },
  ]);
  assert.equal(result.length, 2);
});

test('normaliza mapa con valores {body}', () => {
  const result = normalizeHarnessIntentions({
    support: { body: 'Detectar demanda.' },
    marketing: { harnessType: 'marketing', body: 'Medir respuestas.' },
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].body, 'Detectar demanda.');
});

test('normaliza una entrada única {harnessType, body}', () => {
  const result = normalizeHarnessIntentions({ harnessType: 'support', body: 'Detectar demanda.' });
  assert.deepEqual(result, [{ harnessType: 'support', body: 'Detectar demanda.' }]);
});

test('un objeto vacío no inventa particulares', () => {
  assert.deepEqual(normalizeHarnessIntentions({}), []);
});

test('rechaza arnés desconocido, duplicados y cuerpos inválidos', () => {
  assert.throws(() => normalizeHarnessIntentions({ unknown: 'x' }), /harnessType inválido/);
  assert.throws(
    () =>
      normalizeHarnessIntentions([
        { harnessType: 'support', body: 'a' },
        { harnessType: 'support', body: 'b' },
      ]),
    /duplicado/
  );
  assert.throws(() => normalizeHarnessIntentions({ support: 123 }), /texto u objeto/);
  assert.throws(() => normalizeHarnessIntentions({ support: '' }), /vacía/);
  assert.throws(() => normalizeHarnessIntentions([{ harnessType: 'support' }]), /body.*texto/);
});

test('no descarta claves extra silenciosamente', () => {
  assert.throws(
    () => normalizeHarnessIntentions({ support: { body: 'x', extra: true } }),
    /clave no permitida/
  );
  assert.throws(
    () => normalizeHarnessIntentions([{ harnessType: 'support', body: 'x', extra: true }]),
    /clave no permitida/
  );
});
