/**
 * Worker de los 4 arneses (proceso real, aparte del Dashboard).
 *
 *   npm run harness:worker            # escucha la cola y ejecuta
 *   npm run harness:worker:once       # procesa lo que haya en cola y termina
 *   node script/harness-worker.mjs --once --harness=b2b,marketing
 *
 * Flujo:
 *   1. late (heartbeat) como `support` | `b2b` | `prospecting` | `marketing`;
 *   2. reclama atómicamente la siguiente actividad en cola de cada arnés;
 *   3. ejecuta el adaptador real (`script/harness-adapters.mjs`);
 *   4. guarda el resultado completo y emite activity.completed/failed/blocked en Convex.
 *
 * El Dashboard NO ejecuta nada por sí mismo: solo encola y lee resultados.
 */
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { HARNESS_TYPES, isHarnessType } from '../convex/lib/harnessActivities.ts';
import { AdapterBlockedError } from './harness-adapters.mjs';
import { ACTIVITY_ADAPTERS } from './harness-activity-adapters.mjs';

// Cargar .env.local desde la raíz del repo (Node >= 20.12 / 22+).
try {
  process.loadEnvFile('.env.local');
} catch {
  // Sin archivo: se usan las variables del entorno de la terminal.
}

function argValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Uso: node script/harness-worker.mjs [--once] [--harness=support,b2b,prospecting,marketing] [--interval=2000]

Sin --harness ejecuta los cuatro. --once procesa la cola actual y termina.
Necesita en .env.local (o el entorno):
  CONVEX_URL | NEXT_PUBLIC_CONVEX_URL
  CONVEX_SERVER_SECRET
  SWARMY_TENANT_ID
  SWARMY_WORKSPACE_ID
Opcional:
  GITHUB_TOKEN  (sube el límite de la API de GitHub para prospección)`);
  process.exit(0);
}

const ONCE = process.argv.includes('--once');
const INTERVAL_MS = Math.max(500, Number(argValue('--interval')) || 2000);
const requested = argValue('--harness')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const selected = requested.length ? requested.filter(isHarnessType) : [...HARNESS_TYPES];
if (!selected.length) {
  console.error('ERROR: --harness no contiene ningún arnés válido.');
  process.exit(2);
}

const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '';
const SERVER_SECRET = process.env.CONVEX_SERVER_SECRET || '';
const TENANT_ID = process.env.SWARMY_TENANT_ID || '';
const WORKSPACE_ID = process.env.SWARMY_WORKSPACE_ID || '';

const missing = [
  ['CONVEX_URL | NEXT_PUBLIC_CONVEX_URL', CONVEX_URL],
  ['CONVEX_SERVER_SECRET', SERVER_SECRET],
  ['SWARMY_TENANT_ID', TENANT_ID],
  ['SWARMY_WORKSPACE_ID', WORKSPACE_ID],
].filter(([, value]) => !value);
if (missing.length) {
  console.error(`ERROR: falta configuración: ${missing.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);
const api = anyApi.serverOrchestration;
const busy = Object.fromEntries(HARNESS_TYPES.map((h) => [h, false]));
let lastHeartbeat = 0;
let stopping = false;

function log(harness, message, activityId) {
  const suffix = activityId ? ` ${activityId}` : '';
  console.log(`[${new Date().toISOString()}] [${harness}]${suffix} ${message}`);
}

function sanitizeError(err) {
  let raw = err instanceof Error ? err.message : String(err);
  for (const secret of [SERVER_SECRET, process.env.GITHUB_TOKEN]) {
    if (secret) raw = raw.split(secret).join('[REDACTED]');
  }
  return raw.slice(0, 1800);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function heartbeat(force = false) {
  if (!force && Date.now() - lastHeartbeat < 15_000) return;
  lastHeartbeat = Date.now();
  await Promise.all(
    selected.map(async (harness) => {
      try {
        await client.mutation(api.pingConnection, {
          serverSecret: SERVER_SECRET,
          connectionId: harness,
          tenantId: TENANT_ID,
          harnessType: harness,
          executing: busy[harness] === true,
          isMock: false,
        });
      } catch (err) {
        log(harness, `heartbeat falló: ${sanitizeError(err)}`);
      }
    })
  );
}

async function claimNext(harness) {
  return await client.mutation(api.claimNextHarnessActivity, {
    serverSecret: SERVER_SECRET,
    tenantId: TENANT_ID,
    harnessType: harness,
  });
}

async function finish(activity, status, result, error) {
  await client.mutation(api.completeHarnessActivity, {
    serverSecret: SERVER_SECRET,
    tenantId: TENANT_ID,
    activityId: activity.activityId,
    status,
    ...(result !== undefined ? { result } : {}),
    ...(error ? { error } : {}),
  });
}

async function loadProspectingHistory() {
  try {
    const rows = await client.query(api.listHarnessActivities, {
      serverSecret: SERVER_SECRET,
      tenantId: TENANT_ID,
      harnessType: 'prospecting',
      status: 'completed',
      includeResult: true,
      limit: 50,
    });
    const handles = new Set();
    for (const row of rows ?? []) {
      const result = row?.result ?? {};
      // El adapter adicional guarda todos los verificados en `items`; el original
      // guarda top 5 en `items`, todos en `verified` y el histórico acumulado.
      for (const collection of [result.items, result.verified, result.history]) {
        if (!Array.isArray(collection)) continue;
        for (const item of collection) {
          if (typeof item === 'string') handles.add(item);
          else if (item && typeof item.handle === 'string') handles.add(item.handle);
        }
      }
    }
    return [...handles];
  } catch {
    return [];
  }
}

/** Emite un evento por cada prospecto del top 5 (reutiliza `prospecto.verificado` del trabajo previo). */
async function emitProspectEvents(activity, result) {
  // Solo el top 5 genera eventos; el resto queda en el resultado persistido.
  const items = Array.isArray(result?.items) ? result.items.slice(0, 5) : [];
  for (const prospect of items) {
    if (!prospect || typeof prospect.handle !== 'string') continue;
    try {
      await client.mutation(api.ingestEvent, {
        serverSecret: SERVER_SECRET,
        version: 'v1.0',
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        runId: activity.runId,
        eventType: 'prospecto.verificado',
        payload: { ...prospect, runId: activity.runId, activityId: activity.activityId, isMock: false },
        idempotencyKey: `prospecto_${activity.activityId}_${prospect.handle}`,
        humanApprovalRequired: false,
      });
    } catch (err) {
      log('prospecting', `no se pudo emitir prospecto.verificado de @${prospect.handle}: ${sanitizeError(err)}`, activity.activityId);
    }
  }
}

async function processOne(harness) {
  const activity = await claimNext(harness);
  if (!activity) return false;

  const adapter = ACTIVITY_ADAPTERS[activity.activity];
  if (!adapter) {
    await finish(activity, 'failed', undefined, `No existe adaptador para la actividad '${activity.activity}'.`);
    return true;
  }

  busy[harness] = true;
  await heartbeat(true);
  const started = Date.now();
  log(harness, `ejecutando '${activity.activity}'`, activity.activityId);

  try {
    if (harness === 'prospecting') activity.history = await loadProspectingHistory();
    const ctx = {
      log: (message) => log(harness, message, activity.activityId),
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      serverSecret: SERVER_SECRET,
      convex: client,
      anyApi,
      history: activity.history ?? [],
      signal: undefined,
    };
    const result = await adapter(activity.input ?? {}, ctx);
    if (harness === 'prospecting') await emitProspectEvents(activity, result);
    await finish(activity, 'completed', result);
    const ms = Date.now() - started;
    const summary = result?.summary ? JSON.stringify(result.summary) : 'sin summary';
    log(harness, `completada en ${ms} ms · ${summary}`, activity.activityId);
    if (harness === 'prospecting' && result?.note) log(harness, `nota: ${result.note}`, activity.activityId);
  } catch (err) {
    const blocked = err instanceof AdapterBlockedError;
    const status = blocked ? 'blocked' : 'failed';
    const message = sanitizeError(err);
    try {
      await finish(activity, status, undefined, message);
    } catch (finishErr) {
      log(harness, `no se pudo cerrar la actividad: ${sanitizeError(finishErr)}`, activity.activityId);
    }
    log(harness, `${status}: ${message}`, activity.activityId);
  } finally {
    busy[harness] = false;
    await heartbeat(true);
  }
  return true;
}

async function main() {
  console.log(`harness-worker · ${ONCE ? 'once' : 'daemon'} · arneses: ${selected.join(', ')}`);
  console.log(`Convex: ${CONVEX_URL.replace(/^https?:\/\//, '').split('.')[0]}… · tenant: ${TENANT_ID} · workspace: ${WORKSPACE_ID}`);
  if (selected.includes('prospecting') && !process.env.GITHUB_TOKEN) {
    console.log('Aviso: sin GITHUB_TOKEN la prospección usará el límite anónimo (2 búsquedas / 8 candidatos).');
  }

  await heartbeat(true);

  if (ONCE) {
    let processed = 0;
    for (let round = 0; round < 20; round += 1) {
      let did = false;
      for (const harness of selected) {
        // Drena la cola de cada arnés en este pase.
        while (processed < 50 && (await processOne(harness))) {
          processed += 1;
          did = true;
        }
      }
      if (!did) break;
    }
    console.log(`once: ${processed} actividad(es) procesada(s).`);
    return;
  }

  while (!stopping) {
    await heartbeat();
    let did = false;
    for (const harness of selected) {
      if (stopping) break;
      try {
        if (await processOne(harness)) did = true;
      } catch (err) {
        log(harness, `error en el bucle: ${sanitizeError(err)}`);
      }
    }
    if (!did) await sleep(INTERVAL_MS);
  }
  console.log('worker detenido.');
}

process.on('SIGINT', () => {
  stopping = true;
  console.log('\nSIGINT: terminando la actividad en curso antes de salir…');
});
process.on('SIGTERM', () => {
  stopping = true;
});

main().catch((err) => {
  console.error('ERROR fatal del worker:', sanitizeError(err));
  process.exit(1);
});
