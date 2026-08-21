#!/usr/bin/env node
/**
 * E2E harness — "generate opportunities" flow (TAREA 9 · INT-005-E2E-FALLOS).
 *
 * Spawns:
 *   1. script/mock-rl-server.mjs  (mock RAG + Launch on 127.0.0.1:15999)
 *   2. next dev instance A        (port 3101, RAG+Launch→mock)
 *   3. next dev instance B        (port 3102, LAUNCH_DEPLOY_ENABLED=false) — rate-limit + disabled
 *
 * Runs HTTP scenarios against the instances with a forged wallet session cookie
 * (HMAC rules from src/lib/sessionAuth.ts) and verifies each failure seam.
 * Uses a REAL paid Stripe test session (status=complete / payment_status=paid)
 * so the /api/deploy/launch payment gate is exercised without charging anyone.
 *
 * Usage: node script/e2e-luck-flow.mjs [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------
const dot = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) dot[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}
const SECRET = dot.DASHBOARD_SESSION_SECRET;
const CONVEX_URL = dot.NEXT_PUBLIC_CONVEX_URL || dot.CONVEX_URL;
const SERVER_SECRET = dot.CONVEX_SERVER_SECRET;
const STRIPE_SECRET = dot.STRIPE_SECRET_KEY;

function b64url(s) {
  return Buffer.from(s, 'utf8').toString('base64url');
}
function forgeSessionCookie(address) {
  if (!SECRET) throw new Error('Missing DASHBOARD_SESSION_SECRET.');
  const payload = {
    address: address.toLowerCase(),
    human: true,
    exp: Date.now() + 1000 * 60 * 60 * 12,
    luckIdeaId: `e2e-luck-${Date.now()}`,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `ad_session=${encodeURIComponent(`${body}.${sig}`)}`;
}

// ---------------------------------------------------------------------------
// Small HTTP helper
// ---------------------------------------------------------------------------
async function call(base, pathname, { method = 'GET', cookie, body, qs } = {}) {
  const url = `${base}${pathname}${qs ? `?${qs}` : ''}`;
  const headers = {};
  if (cookie) headers['cookie'] = cookie;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}

// ---------------------------------------------------------------------------
// Process orchestration
// ---------------------------------------------------------------------------
const children = [];
function spawnServer(tagName, cmd, args, env) {
  const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => VERBOSE && console.log(`[${tagName}] ${d.toString().trim()}`));
  child.stderr.on('data', (d) => VERBOSE && console.error(`[${tagName}] ${d.toString().trim()}`));
  children.push(child);
  return child;
}

async function waitFor(port, urlPath, tagName, timeoutMs = 240_000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    if (children.some((c) => c.exitCode !== null)) throw new Error(`Child ${tagName} exited early.`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, { redirect: 'manual' });
      return { code: res.status, ms: Date.now() - start };
    } catch (err) {
      lastErr = err.message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for ${tagName} on :${port} (last: ${lastErr})`);
}

function instanceEnv(overrides) {
  const env = { ...process.env, ...dot };
  delete env.PORT;
  env.NODE_ENV = 'development';
  Object.assign(env, overrides);
  return env;
}

const MOCK_PORT = 15999;
const PORT_A = 3101;
const PORT_B = 3102;
const PORT_C = 3103;
const MOCK_STATE = `http://127.0.0.1:${MOCK_PORT}`;

async function setMock(patch) {
  const res = await call(MOCK_STATE, '/__control', { method: 'POST', body: patch });
  if (res.status !== 200) throw new Error(`mock control failed: ${res.status}`);
  return res.json;
}

// ---------------------------------------------------------------------------
// Convex checks for orphan resources
// ---------------------------------------------------------------------------
let convex = null;
async function convexSessionByOpportunity(uuid) {
  if (!convex) convex = new ConvexHttpClient(CONVEX_URL);
  return convex.query('serverOrchestration:getSessionByOpportunityServer', {
    opportunityId: uuid,
    serverSecret: SERVER_SECRET,
  });
}

// ---------------------------------------------------------------------------
// Result collector
// ---------------------------------------------------------------------------
const results = [];
function record(id, name, expected, actual, pass, evidence) {
  results.push({ id, name, expected, actual, pass, evidence });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`\n${mark} ${id} · ${name}`);
  console.log(`   expected : ${JSON.stringify(expected)}`);
  console.log(`   actual   : ${JSON.stringify(actual)}`);
  if (evidence !== undefined) console.log(`   evidence : ${JSON.stringify(evidence)}`);
}

function summarize() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log('\n=================================================');
  console.log(`E2E summary: ${pass}/${results.length} passed, ${fail} failed`);
  console.log('=================================================');
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}`);
  const file = path.join(ROOT, 'script', 'e2e-results.json');
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`results written to ${file}`);
  if (fail > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Stripe paid session discovery
// ---------------------------------------------------------------------------
async function findPaidSession() {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions?limit=30', {
    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(`Stripe list error: ${json.error.message}`);
  const paid = (json.data || [])
    .filter((s) => s.status === 'complete' && s.payment_status === 'paid')
    .sort((a, b) => b.created - a.created);
  const preferred =
    paid.find((s) => s.metadata?.flowSource === 'opportunity') || paid.find((s) => s.mode === 'payment') || paid[0];
  return { sessionId: preferred?.id, metadata: preferred?.metadata || {}, mode: preferred?.mode };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
const API_A = `http://127.0.0.1:${PORT_A}`;
const API_B = `http://127.0.0.1:${PORT_B}`;
const API_C = `http://127.0.0.1:${PORT_C}`;
const WALLET = '0x1111111111111111111111111111111111111111';
const cookie = forgeSessionCookie(WALLET);

async function run() {
  const paid = await findPaidSession();
  if (!paid.sessionId) throw new Error('No paid Stripe test session available.');
  console.log(`Using paid Stripe test session ${paid.sessionId} (${paid.mode})`);

  // ===================================================================
  // GROUP 1 — RAG seams (generate)
  // ===================================================================
  await setMock({ rag: 'ok' });

  let r = await call(API_A, '/api/opportunities/generate', {
    method: 'POST',
    cookie,
    qs: 'simulate=empty-bank',
  });
  record(
    'S01',
    'RAG · simulate=empty-bank hook',
    { status: 200, ok: true, bankEmpty: true, len: 0 },
    { status: r.status, ok: r.json?.ok, bankEmpty: r.json?.bankEmpty, len: r.json?.opportunities?.length },
    r.status === 200 && r.json?.ok === true && r.json?.bankEmpty === true && r.json?.opportunities?.length === 0
  );

  await setMock({ rag: 'empty' });
  r = await call(API_A, '/api/opportunities/generate', { method: 'POST', cookie });
  record(
    'S02',
    'RAG · banco vacío (data: [])',
    { status: 200, ok: true, bankEmpty: true },
    { status: r.status, ok: r.json?.ok, bankEmpty: r.json?.bankEmpty },
    r.status === 200 && r.json?.ok === true && r.json?.bankEmpty === true
  );

  await setMock({ rag: '500' });
  r = await call(API_A, '/api/opportunities/generate', { method: 'POST', cookie });
  record(
    'S03',
    'RAG · 500 (upstream)',
    { status: 502, code: 'RAG_UPSTREAM_ERROR', retryable: true },
    { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable },
    r.status === 502 && r.json?.error?.code === 'RAG_UPSTREAM_ERROR' && r.json?.error?.retryable === true
  );

  await setMock({ rag: 'invalid-shape' });
  r = await call(API_A, '/api/opportunities/generate', { method: 'POST', cookie });
  record(
    'S04',
    'RAG · forma inesperada',
    { status: 502, code: 'RAG_INVALID_RESPONSE', retryable: true },
    { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable },
    r.status === 502 && r.json?.error?.code === 'RAG_INVALID_RESPONSE' && r.json?.error?.retryable === true
  );

  await setMock({ rag: 'down' });
  r = await call(API_A, '/api/opportunities/generate', { method: 'POST', cookie });
  record(
    'S05',
    'RAG · conexión caída (TypeError→RAG_UPSTREAM_ERROR)',
    { status: 502, code: 'RAG_UPSTREAM_ERROR', retryable: true },
    { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable },
    r.status === 502 && r.json?.error?.code === 'RAG_UPSTREAM_ERROR' && r.json?.error?.retryable === true
  );

  // ===================================================================
  // GROUP 2 — blueprint seams
  // ===================================================================
  await setMock({ rag: 'ok', blueprint: '404' });
  r = await call(API_A, '/api/opportunities/f0f0f0f0-f0f0-4000-8000-000000000001/blueprint');
  record(
    'S06',
    'Blueprint · 404 no encontrado',
    { status: 404, code: 'BLUEPRINT_NOT_FOUND' },
    { status: r.status, code: r.json?.error?.code },
    r.status === 404 && r.json?.error?.code === 'BLUEPRINT_NOT_FOUND'
  );

  await setMock({ blueprint: '500' });
  r = await call(API_A, '/api/opportunities/f0f0f0f0-f0f0-4000-8000-000000000001/blueprint');
  record(
    'S07',
    'Blueprint · 500 (upstream)',
    { status: 502, code: 'RAG_UPSTREAM_ERROR' },
    { status: r.status, code: r.json?.error?.code },
    r.status === 502 && r.json?.error?.code === 'RAG_UPSTREAM_ERROR'
  );

  await setMock({ blueprint: 'down' });
  r = await call(API_A, '/api/opportunities/f0f0f0f0-f0f0-4000-8000-000000000001/blueprint');
  record(
    'S08',
    'Blueprint · conexión caída (TypeError→RAG_UPSTREAM_ERROR)',
    { status: 502, code: 'RAG_UPSTREAM_ERROR', retryable: true },
    { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable },
    r.status === 502 && r.json?.error?.code === 'RAG_UPSTREAM_ERROR' && r.json?.error?.retryable === true
  );

  // ===================================================================
  // GROUP 3 — happy path pieces (intake → checkout → verify)
  // ===================================================================
  await setMock({ rag: 'ok', blueprint: 'ok' });
  r = await call(API_A, '/api/opportunities/generate', { method: 'POST', cookie });
  const opps = r.json?.opportunities || [];
  record(
    'S09',
    'Happy · generate (3 oportunidades)',
    { status: 200, bankEmpty: false, n: 3 },
    { status: r.status, bankEmpty: r.json?.bankEmpty, n: opps.length },
    r.status === 200 && r.json?.bankEmpty === false && opps.length === 3 && typeof opps[0]?.id === 'string'
  );

  const happyOpp = opps[0];
  r = await call(API_A, `/api/opportunities/${encodeURIComponent(happyOpp.id)}/blueprint`);
  record(
    'S10',
    'Happy · blueprint markdown',
    { status: 200, ok: true },
    { status: r.status, ok: r.json?.ok, md: typeof r.json?.blueprint?.markdown },
    r.status === 200 && r.json?.ok === true && typeof r.json?.blueprint?.markdown === 'string'
  );

  r = await call(API_A, '/api/founder/luck-intake', {
    method: 'POST',
    cookie,
    body: {
      opportunity: { ...happyOpp, blueprint: { markdown: r.json.blueprint.markdown } },
      intakeSource: 'rag_opportunity',
    },
  });
  const ideaId = r.json?.ideaId || null;
  record(
    'S11',
    'Happy · luck-intake (ideaId → Convex)',
    { status: 200, ok: true, ideaId: 'string' },
    { status: r.status, ok: r.json?.ok, ideaId: typeof ideaId },
    r.status === 200 && r.json?.ok === true && typeof ideaId === 'string'
  );

  r = await call(API_A, '/api/founder/luck-intake', {
    method: 'POST',
    body: {
      opportunity: { ...happyOpp, blueprint: { markdown: '# x' } },
      intakeSource: 'rag_opportunity',
    },
  });
  record(
    'S12',
    'luck-intake · sin sesión (401)',
    { status: 401, code: 'UNAUTHORIZED' },
    { status: r.status, code: r.json?.error?.code },
    r.status === 401 && r.json?.error?.code === 'UNAUTHORIZED'
  );

  r = await call(API_A, '/api/billing/checkout', {
    method: 'POST',
    cookie,
    body: {
      planId: 'blueprint',
      companyName: 'E2E Test Co',
      flowSource: 'opportunity',
      ideaId,
      opportunityId: happyOpp.id,
    },
  });
  const newCheckoutSessionId = r.json?.sessionId || null;
  record(
    'S13',
    'Happy · checkout Stripe (sesión test, sin cargo)',
    { status: 200, ok: true, mode: 'stripe', checkoutUrl: true },
    { status: r.status, ok: r.json?.ok, mode: r.json?.mode, checkoutUrl: !!r.json?.checkoutUrl },
    r.status === 200 && r.json?.ok === true && r.json?.mode === 'stripe' && !!r.json?.checkoutUrl
  );

  r = await call(API_A, `/api/billing/verify?session_id=${encodeURIComponent(newCheckoutSessionId)}`, { cookie });
  record(
    'S14',
    'verify · sesión nueva sin pagar (paid:false)',
    { status: 200, paid: false },
    { status: r.status, paid: r.json?.paid },
    r.status === 200 && r.json?.paid === false
  );

  r = await call(API_A, `/api/billing/verify?session_id=${encodeURIComponent(paid.sessionId)}`, { cookie });
  record(
    'S15',
    'verify · sesión histórica pagada (paid:true)',
    { status: 200, paid: true },
    { status: r.status, paid: r.json?.paid },
    r.status === 200 && r.json?.paid === true
  );

  // ===================================================================
  // GROUP 4 — deploy launch seams
  // ===================================================================
  r = await call(API_A, '/api/deploy/launch', { method: 'POST', cookie, body: {} });
  record(
    'S16',
    'launch · faltan session_id (400)',
    { status: 400, code: 'BAD_REQUEST' },
    { status: r.status, code: r.json?.error?.code },
    r.status === 400 && r.json?.error?.code === 'BAD_REQUEST'
  );

  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    body: { session_id: paid.sessionId },
  });
  record(
    'S17',
    'launch · sin sesión de usuario (401)',
    { status: 401, code: 'UNAUTHORIZED' },
    { status: r.status, code: r.json?.error?.code },
    r.status === 401 && r.json?.error?.code === 'UNAUTHORIZED'
  );

  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: newCheckoutSessionId },
  });
  record(
    'S18',
    'launch · pago no verificado (402)',
    { status: 402, code: 'PAYMENT_NOT_PAID' },
    { status: r.status, code: r.json?.error?.code },
    r.status === 402 && r.json?.error?.code === 'PAYMENT_NOT_PAID'
  );

  // Clean UUIDs with no prior orchestration session.
  const uuidOk = crypto.randomUUID();
  await setMock({ launch: 'ok', status: 'ready' });
  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: uuidOk, companyName: 'E2E Deploy Co' },
  });
  const orchestrationSessionId = r.json?.orchestrationSessionId || null;
  record(
    'S19',
    'launch · OK (deploy aceptado + sesión orquestación)',
    { status: 200, ok: true, alreadyExisted: false, orch: 'string-or-null' },
    {
      status: r.status,
      ok: r.json?.ok,
      alreadyExisted: r.json?.alreadyExisted,
      orch: typeof orchestrationSessionId,
      companyId: r.json?.companyId,
      deploymentId: r.json?.deploymentId,
    },
    r.status === 200 && r.json?.ok === true && r.json?.alreadyExisted === false,
    { orchestrationSessionId, deploymentId: r.json?.deploymentId, companyId: r.json?.companyId }
  );

  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: uuidOk, companyName: 'E2E Deploy Co' },
  });
  record(
    'S20',
    'launch · reintento → idempotente (alreadyExisted)',
    { status: 200, ok: true, alreadyExisted: true },
    { status: r.status, ok: r.json?.ok, alreadyExisted: r.json?.alreadyExisted },
    r.status === 200 && r.json?.ok === true && r.json?.alreadyExisted === true
  );

  const uuid409 = crypto.randomUUID();
  await setMock({ launch: '409' });
  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: uuid409, companyName: 'E2E 409 Co' },
  });
  record(
    'S21',
    'launch · 409 IDEA_NO_DISPONIBLE → Opción R (redeem)',
    { status: 409, code: 'IDEA_NO_DISPONIBLE', action: 'elegir_nueva_idea' },
    { status: r.status, code: r.json?.error?.code, action: r.json?.error?.action },
    r.status === 409 && r.json?.error?.code === 'IDEA_NO_DISPONIBLE' && r.json?.error?.action === 'elegir_nueva_idea'
  );

  await setMock({ launch: 'ok' });
  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    qs: 'simulate=409',
    body: { session_id: paid.sessionId, opportunityId: crypto.randomUUID(), companyName: 'E2E Sim 409' },
  });
  record(
    'S22',
    'launch · hook ?simulate=409 (E2E redeem sin Launch real)',
    { status: 409, code: 'IDEA_NO_DISPONIBLE', action: 'elegir_nueva_idea' },
    { status: r.status, code: r.json?.error?.code, action: r.json?.error?.action },
    r.status === 409 && r.json?.error?.code === 'IDEA_NO_DISPONIBLE' && r.json?.error?.action === 'elegir_nueva_idea'
  );

  await setMock({ launch: '500' });
  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: crypto.randomUUID() },
  });
  record(
    'S23',
    'launch · 500 (upstream)',
    { status: 502, code: 'LAUNCH_UPSTREAM_ERROR', retryable: true },
    { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable },
    r.status === 502 && r.json?.error?.code === 'LAUNCH_UPSTREAM_ERROR' && r.json?.error?.retryable === true
  );

  await setMock({ launch: 'timeout' });
  const t0 = Date.now();
  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: crypto.randomUUID() },
  });
  record(
    'S24',
    'launch · timeout 10s (AbortController)',
    { status: 502, code: 'LAUNCH_TIMEOUT', retryable: true, elapsed: '>=9s' },
    { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable, elapsed: `${((Date.now() - t0) / 1000).toFixed(1)}s` },
    r.status === 502 && r.json?.error?.code === 'LAUNCH_TIMEOUT' && r.json?.error?.retryable === true && Date.now() - t0 >= 9000
  );

  await setMock({ launch: 'down' });
  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: crypto.randomUUID() },
  });
  record(
    'S25',
    'launch · conexión caída',
    { status: 502, code: 'LAUNCH_CONNECTION_ERROR', retryable: true },
    { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable },
    r.status === 502 && r.json?.error?.code === 'LAUNCH_CONNECTION_ERROR' && r.json?.error?.retryable === true
  );

  // Launch disabled — instance B (LAUNCH_DEPLOY_ENABLED=false)
  await setMock({ launch: 'ok' });
  r = await call(API_B, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: crypto.randomUUID() },
  });
  record(
    'S26',
    'launch · APAGADO (LAUNCH_DEPLOY_ENABLED=false)',
    { status: 501, code: 'LAUNCH_DISABLED' },
    { status: r.status, code: r.json?.error?.code },
    r.status === 501 && r.json?.error?.code === 'LAUNCH_DISABLED'
  );

  // ===================================================================
  // GROUP 5 — status polling / VPS capacity (uses session from S19)
  // ===================================================================
  if (orchestrationSessionId) {
    await setMock({ status: 'failed' });
    r = await call(API_A, `/api/deploy/status?sessionId=${encodeURIComponent(orchestrationSessionId)}`, { cookie });
    record(
      'S28',
      'status · VPS sin capacidad (failed)',
      { status: 200, status: 'failed', sessionStatus: 'failed', error: 'contiene SIN_CAPACIDAD' },
      {
        status: r.status,
        status: r.json?.status,
        sessionStatus: r.json?.sessionStatus,
        errHas: typeof r.json?.error === 'string' && r.json.error.includes('SIN_CAPACIDAD'),
      },
      r.status === 200 && r.json?.status === 'failed' && r.json?.sessionStatus === 'failed'
    );

    const mirrored = await convexSessionByOpportunity(uuidOk);
    record(
      'S29',
      'status · fallo espejado a Convex (no huérfano: sesión queda en failed)',
      { sessionStatus: 'failed', exists: true },
      { exists: !!mirrored, status: mirrored?.status },
      !!mirrored?.status && mirrored.status === 'failed'
    );

    await setMock({ status: 'ready' });
    r = await call(API_A, `/api/deploy/status?sessionId=${encodeURIComponent(orchestrationSessionId)}`, { cookie });
    record(
      'S30',
      'status · ready → Agent Office (UI redirige)',
      { status: 200, status: 'ready', sessionStatus: 'active', url: true },
      { status: r.status, status: r.json?.status, sessionStatus: r.json?.sessionStatus, url: !!r.json?.url },
      r.status === 200 && r.json?.status === 'ready' && r.json?.sessionStatus === 'active' && !!r.json?.url
    );

    await setMock({ status: 'down' });
    r = await call(API_A, `/api/deploy/status?sessionId=${encodeURIComponent(orchestrationSessionId)}`, { cookie });
    record(
      'S31',
      'status · Launch caído en el poll (502 silencioso, refetch)',
      { status: 502, code: 'LAUNCH_CONNECTION_ERROR', retryable: true },
      { status: r.status, code: r.json?.error?.code, retryable: r.json?.error?.retryable },
      r.status === 502 && r.json?.error?.code === 'LAUNCH_CONNECTION_ERROR' && r.json?.error?.retryable === true
    );
  } else {
    console.log('\nSKIP GROUP 5 (no orchestrationSessionId from S19)');
  }

  // ===================================================================
  // GROUP 6 — orphan resources
  // ===================================================================
  const sess409 = await convexSessionByOpportunity(uuid409);
  record(
    'S32',
    'Orphan · fallo 409 NO crea sesión de orquestación en Convex',
    { created: false },
    { created: !!sess409 },
    !sess409
  );

  await setMock({ launch: '409' });
  r = await call(API_A, '/api/deploy/launch', {
    method: 'POST',
    cookie,
    body: { session_id: paid.sessionId, opportunityId: uuid409 },
  });
  record(
    'S33',
    'Orphan · relanzar uuid del 409 → vuelve 409 (no dedup, nada persistido)',
    { status: 409, alreadyExisted: false },
    { status: r.status, alreadyExisted: r.json?.alreadyExisted, code: r.json?.error?.code },
    r.status === 409 && r.json?.error?.code === 'IDEA_NO_DISPONIBLE' && r.json?.alreadyExisted !== true
  );

  const sessOk = await convexSessionByOpportunity(uuidOk);
  record(
    'S34',
    'Orphan · deploy OK SÍ crea sesión (consistente)',
    { created: true, alreadyExistedAtDedup: true },
    { created: !!sessOk },
    !!sessOk
  );

  // ===================================================================
  // GROUP 7 — rate limits (instance B, fresh counters)
  // ===================================================================
  let lastStatus = 0;
  for (let i = 0; i < 22; i++) {
    r = await call(API_B, '/api/opportunities/generate', { method: 'POST', cookie });
    lastStatus = r.status;
    if (i === 19 && r.status !== 200) break;
    if (r.status === 429) break;
  }
  record(
    'S35',
    'Rate limit · 20 req/5min en generate → 21ª petición 429',
    { over20th: 429 },
    { status: lastStatus },
    lastStatus === 429
  );

  // Hook reachable even with MOCK_RAG_OPPORTUNITIES=true (instance C, offline mock).
  await setMock({ rag: 'ok' });
  r = await call(API_C, '/api/opportunities/generate', {
    method: 'POST',
    cookie,
    qs: 'simulate=empty-bank',
  });
  record(
    'S36',
    'Hook · simulate=empty-bank alcanzable con mock de oportunidades activo',
    { status: 200, ok: true, bankEmpty: true },
    { status: r.status, ok: r.json?.ok, bankEmpty: r.json?.bankEmpty, n: r.json?.opportunities?.length },
    r.status === 200 && r.json?.ok === true && r.json?.bankEmpty === true && r.json?.opportunities?.length === 0
  );

  summarize();
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------
async function main() {
  const mockArgs = [path.join(ROOT, 'script', 'mock-rl-server.mjs')];
  spawnServer('mock-rl', process.execPath, mockArgs, { ...process.env, MOCK_RL_PORT: String(MOCK_PORT) });
  await waitFor(MOCK_PORT, '/health', 'mock-rl', 30_000);

  const nextBin = [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')];
  spawnServer('next-A', process.execPath, [...nextBin, 'dev', '--port', String(PORT_A)], instanceEnv({
    RAG_SERVICE_BASE_URL: MOCK_STATE,
    LAUNCH_API_URL: MOCK_STATE,
    LAUNCH_DEPLOY_ENABLED: 'true',
    MOCK_RAG_OPPORTUNITIES: 'false',
  }));
  await waitFor(PORT_A, '/api/orchestration/health', 'next-A');

  spawnServer('next-B', process.execPath, [...nextBin, 'dev', '--port', String(PORT_B)], instanceEnv({
    RAG_SERVICE_BASE_URL: MOCK_STATE,
    LAUNCH_API_URL: MOCK_STATE,
    LAUNCH_DEPLOY_ENABLED: 'false',
    MOCK_RAG_OPPORTUNITIES: 'false',
  }));
  await waitFor(PORT_B, '/api/orchestration/health', 'next-B');

  spawnServer('next-C', process.execPath, [...nextBin, 'dev', '--port', String(PORT_C)], instanceEnv({
    RAG_SERVICE_BASE_URL: MOCK_STATE,
    LAUNCH_API_URL: MOCK_STATE,
    LAUNCH_DEPLOY_ENABLED: 'false',
    MOCK_RAG_OPPORTUNITIES: 'true',
  }));
  await waitFor(PORT_C, '/api/orchestration/health', 'next-C');

  await run();
}

main().catch((err) => {
  console.error('[harness] fatal:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
}).finally(() => {
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
});