import test from 'node:test';
import assert from 'node:assert/strict';
import { HARNESS_CATALOG, HARNESS_TYPES } from '../convex/lib/harnessActivities.ts';
import { HarnessInputError, normalizeActivityInput } from '../src/lib/harnessInput.ts';
import { extractHtmlSignals } from './harness-adapters.mjs';

test('catálogo: 4 arneses, 4 actividades ejecutables y campos declarados', () => {
  assert.equal(HARNESS_TYPES.length, 4);
  const keys = HARNESS_TYPES.map((h) => HARNESS_CATALOG[h].activity.key);
  assert.equal(new Set(keys).size, 4);
  for (const harness of HARNESS_TYPES) {
    const def = HARNESS_CATALOG[harness];
    assert.ok(def.label);
    assert.ok(def.activity.description);
    assert.ok(def.activity.inputFields.length > 0);
  }
});

test('B2B: normaliza dominios a https y rechaza hosts privados/localhost', () => {
  const { input } = normalizeActivityInput('b2b', 'account_qualification', {
    targets: 'acme.com\nhttps://ejemplo.mx/contacto',
  });
  assert.deepEqual(input.targets, ['https://acme.com/', 'https://ejemplo.mx/contacto']);
  assert.throws(
    () => normalizeActivityInput('b2b', 'account_qualification', { targets: 'localhost' }),
    HarnessInputError
  );
  assert.throws(
    () => normalizeActivityInput('b2b', 'account_qualification', { targets: 'http://192.168.1.10' }),
    HarnessInputError
  );
  assert.throws(
    () => normalizeActivityInput('b2b', 'account_qualification', { targets: 'http://169.254.169.254/latest' }),
    HarnessInputError
  );
});

test('B2B: exige al menos un objetivo y limita volumen', () => {
  assert.throws(() => normalizeActivityInput('b2b', 'account_qualification', { targets: '' }), HarnessInputError);
  const many = Array.from({ length: 25 }, (_, i) => `https://sitio${i}.com`).join('\n');
  assert.throws(() => normalizeActivityInput('b2b', 'account_qualification', { targets: many }), HarnessInputError);
});

test('Marketing: URL por defecto, keywords normalizadas y esquema inválido rechazado', () => {
  const def = normalizeActivityInput('marketing', 'site_audit', { url: '' });
  assert.equal(def.input.url, 'https://avril.systems/');
  const withKeys = normalizeActivityInput('marketing', 'site_audit', {
    url: 'avril.systems',
    keywords: 'Agentes, automatización, agentes',
  });
  assert.deepEqual(withKeys.input.keywords, ['agentes', 'automatización']);
  assert.throws(() => normalizeActivityInput('marketing', 'site_audit', { url: 'javascript:alert(1)' }), HarnessInputError);
});

test('Prospección: parte queries por línea y acota maxCandidates', () => {
  const { input } = normalizeActivityInput('prospecting', 'github_discovery', {
    queries: 'topic:mcp-server\nagent workflow\n',
    maxCandidates: '999',
  });
  assert.deepEqual(input.queries, ['topic:mcp-server', 'agent workflow']);
  assert.equal(input.maxCandidates, 40);
  const min = normalizeActivityInput('prospecting', 'github_discovery', { maxCandidates: 1 });
  assert.equal(min.input.maxCandidates, 5);
});

test('Soporte: acota la ventana y recorta severidad', () => {
  const { input } = normalizeActivityInput('support', 'incident_triage', { lookbackHours: 9999, severity: 'HIGH' });
  assert.equal(input.lookbackHours, 168);
  assert.equal(input.severity, 'HIGH');
});

test('par arnés/actividad inválido se rechaza', () => {
  assert.throws(() => normalizeActivityInput('b2b', 'github_discovery', {}), HarnessInputError);
  assert.throws(() => normalizeActivityInput('otro', 'x', {}), HarnessInputError);
});

test('extractHtmlSignals: título, meta, H1, CTAs y contacto reales', () => {
  const html = `<!doctype html><html lang="es"><head>
    <title>Avril Systems — Agentes de negocio</title>
    <meta name="description" content="Infraestructura y agentes para operar tu negocio.">
    <meta property="og:title" content="Avril">
    <meta property="og:image" content="/og.png">
    <link rel="canonical" href="/">
  </head><body>
    <h1>Automatiza tu operación</h1>
    <h2>Cómo funciona</h2>
    <a href="/demo">Solicitar demo</a>
    <a href="mailto:hola@avril.systems">Contacto</a>
    <script>var supabase = "no-debe-contar";</script>
  </body></html>`;
  const s = extractHtmlSignals(html, 'https://avril.systems/');
  assert.equal(s.title, 'Avril Systems — Agentes de negocio');
  assert.match(s.description, /Infraestructura/);
  assert.deepEqual(s.h1, ['Automatiza tu operación']);
  assert.equal(s.h2.length, 1);
  assert.equal(s.canonical, 'https://avril.systems/');
  assert.ok(s.ctaLinks.some((l) => l.href === 'https://avril.systems/demo'));
  assert.ok(s.contactLinks.some((l) => l.href.startsWith('mailto:hola@avril.systems')));
  assert.ok(s.wordCount > 0);
  assert.ok(s.ogTitle === 'Avril');
  assert.ok(s.ogImage === 'https://avril.systems/og.png');
  // El contenido de <script> no debe contar como texto visible.
  assert.ok(!s.text.includes('no-debe-contar'));
});
