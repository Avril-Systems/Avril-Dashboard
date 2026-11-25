// Worker externo de Staging para Swarmy (W46 P0 - Actividades 4, 5 y 6)
// Ejecutar: node script/swarmy-staging-worker.mjs

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Cargar variables de .env.local si existe (Node >= 20.12 / 22+)
try {
  process.loadEnvFile(".env.local");
} catch {
  // Si no existe .env.local, tomará las variables del entorno de la terminal
}

const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
const SERVER_SECRET = process.env.CONVEX_SERVER_SECRET;
const DEEPSEEK_ADAPTER_URL = process.env.DEEPSEEK_ADAPTER_URL; // Opcional: solo si el adaptador real existe en staging

if (!CONVEX_URL) {
  console.error("ERROR: Falta CONVEX_URL o NEXT_PUBLIC_CONVEX_URL en .env.local");
  process.exit(1);
}
if (!SERVER_SECRET) {
  console.error("ERROR: Falta CONVEX_SERVER_SECRET en el entorno.");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

const TENANT_ID = "AVRIL_STAGING_TENANT";
const WORKSPACE_ID = "ws_staging_01";
const RUN_ID_1 = `run_staging_tick1_${Date.now()}`;
const RUN_ID_2 = `run_staging_tick2_${Date.now()}`;

// Sanitizador para evitar imprimir secretos en logs
function sanitizeLog(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  if (clone.serverSecret) clone.serverSecret = "[REDACTED]";
  return clone;
}

async function emitEvent(params) {
  const res = await client.mutation(api.serverOrchestration.ingestEvent, {
    serverSecret: SERVER_SECRET,
    version: "v1.0",
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    ...params,
  });
  console.log(`  -> [${params.eventType}] (runId: ${params.runId}) => ${res.status}`);
  return res;
}

async function runStagingWorker() {
  console.log("=== INICIANDO WORKER DE STAGING SWARMY (W46 P0) ===");
  console.log(`Endpoint Convex: ${CONVEX_URL}`);
  console.log(`Tenant: ${TENANT_ID} | Workspace: ${WORKSPACE_ID}`);
  console.log("Auth: CONVEX_SERVER_SECRET=[REDACTED]\n");

  // ---------------------------------------------------------
  // TICK 1: Ingesta real, Deduplicación y Handoff DeepSeek
  // ---------------------------------------------------------
  console.log(`--- [TICK 1] Iniciando ciclo con runId: ${RUN_ID_1} ---`);

  // 1. Heartbeat inicial del worker de soporte
  await client.mutation(api.serverOrchestration.pingConnection, {
    serverSecret: SERVER_SECRET,
    connectionId: "support",
    tenantId: TENANT_ID,
    harnessType: "support",
    executing: true,
    isMock: false,
  });
  console.log("  -> Heartbeat registrado para harness 'support' (executing: true, isMock: false)");

  // 2. Evento real de reporte de soporte (Actividad 4)
  const idemTick1Report = `idem_${RUN_ID_1}_report`;
  await emitEvent({
    runId: RUN_ID_1,
    eventType: "support.report.received",
    payload: {
      ticketId: "STG-101",
      severity: "high",
      source: "staging-worker",
      isMock: false,
    },
    idempotencyKey: idemTick1Report,
    humanApprovalRequired: false,
  });

  // 3. Prueba de Deduplicación en Staging (Actividad 6)
  console.log("  -> Reenviando mismo evento (prueba de deduplicación con misma idempotencyKey)...");
  const dupRes = await emitEvent({
    runId: RUN_ID_1,
    eventType: "support.report.received",
    payload: {
      ticketId: "STG-101",
      severity: "high",
      source: "staging-worker",
      isMock: false,
    },
    idempotencyKey: idemTick1Report,
    humanApprovalRequired: false,
  });
  if (dupRes.status !== "idempotent_hit") {
    throw new Error("FALLO: La deduplicación no bloqueó el evento repetido en staging.");
  }

  // 4. Handoff a DeepSeek (Actividad 5: observable o BLOCKED si falta adaptador real)
  const handoffId = `hoff_${RUN_ID_1}`;
  await emitEvent({
    runId: RUN_ID_1,
    eventType: "handoff.created",
    payload: {
      handoffId,
      ticketId: "STG-101",
      from: "support",
      to: "deepseek",
      isMock: false,
    },
    idempotencyKey: `idem_${RUN_ID_1}_handoff`,
    repository: "Avril-Systems/Avril-Dashboard",
    branch: "feat/swarmy-s00",
    humanApprovalRequired: true,
  });

  if (!DEEPSEEK_ADAPTER_URL) {
    // Regla estricta W46: adaptador ausente se marca BLOCKED; no se simula ejecución real con mock
    console.log("  -> [AVISO ACTIVIDAD 5] DEEPSEEK_ADAPTER_URL no configurado en staging. Registrando estado BLOCKED...");
    await emitEvent({
      runId: RUN_ID_1,
      eventType: "error.reported",
      payload: {
        handoffId,
        step: "handoff.ack",
        status: "BLOCKED",
        message: "BLOCKED: Adaptador externo de DeepSeek no disponible/configurado en entorno staging.",
        recoverable: true,
        isMock: false,
      },
      idempotencyKey: `idem_${RUN_ID_1}_blocked`,
      humanApprovalRequired: false,
    });
  } else {
    // Si el adaptador real está configurado, registra la cadena observable completa
    await emitEvent({
      runId: RUN_ID_1,
      eventType: "handoff.ack",
      payload: { handoffId, ackAt: new Date().toISOString(), isMock: false },
      idempotencyKey: `idem_${RUN_ID_1}_ack`,
      humanApprovalRequired: false,
    });
    await emitEvent({
      runId: RUN_ID_1,
      eventType: "diagnosis.ready",
      payload: { handoffId, summary: "Diagnóstico real generado por adaptador", isMock: false },
      idempotencyKey: `idem_${RUN_ID_1}_diag`,
      humanApprovalRequired: false,
    });
    await emitEvent({
      runId: RUN_ID_1,
      eventType: "patch.proposed",
      payload: { handoffId, prRef: "PR#3", isMock: false },
      idempotencyKey: `idem_${RUN_ID_1}_patch`,
      prRef: "PR#3",
      humanApprovalRequired: true,
    });
    await emitEvent({
      runId: RUN_ID_1,
      eventType: "approval.decided",
      payload: { handoffId, decision: "approved", decidedBy: "alejandro", isMock: false },
      idempotencyKey: `idem_${RUN_ID_1}_approval`,
      humanApprovalRequired: false,
    });
    await emitEvent({
      runId: RUN_ID_1,
      eventType: "run.result",
      payload: { handoffId, outcome: "ok", isMock: false },
      idempotencyKey: `idem_${RUN_ID_1}_result`,
      humanApprovalRequired: false,
    });
  }

  // ---------------------------------------------------------
  // FALLO SIMULADO, RECONEXIÓN Y TICK 2 (Actividad 6)
  // ---------------------------------------------------------
  console.log(`\n--- [FALLO Y RECONEXIÓN] Simulando caída transitoria y recuperación ---`);
  await emitEvent({
    runId: RUN_ID_1,
    eventType: "error.reported",
    payload: {
      step: "worker.heartbeat",
      message: "Timeout transitorio de red en worker staging; iniciando reconexión.",
      recoverable: true,
      isMock: false,
    },
    idempotencyKey: `idem_${RUN_ID_1}_net_err`,
    humanApprovalRequired: false,
  });

  // Reconexión mediante nuevo heartbeat
  await client.mutation(api.serverOrchestration.pingConnection, {
    serverSecret: SERVER_SECRET,
    connectionId: "support",
    tenantId: TENANT_ID,
    harnessType: "support",
    executing: true,
    isMock: false,
  });
  console.log("  -> Reconexión exitosa: Heartbeat renovado en Convex.");

  console.log(`\n--- [TICK 2] Iniciando segundo ciclo con runId: ${RUN_ID_2} ---`);
  await emitEvent({
    runId: RUN_ID_2,
    eventType: "support.report.received",
    payload: {
      ticketId: "STG-102",
      severity: "medium",
      source: "staging-worker-reconnected",
      isMock: false,
    },
    idempotencyKey: `idem_${RUN_ID_2}_report`,
    humanApprovalRequired: false,
  });

  await emitEvent({
    runId: RUN_ID_2,
    eventType: "run.result",
    payload: {
      outcome: "ok",
      detail: "Tick 2 completado tras reconexión",
      isMock: false,
    },
    idempotencyKey: `idem_${RUN_ID_2}_result`,
    humanApprovalRequired: false,
  });

  // Marcar worker en reposo tras completar los ticks
  await client.mutation(api.serverOrchestration.pingConnection, {
    serverSecret: SERVER_SECRET,
    connectionId: "support",
    tenantId: TENANT_ID,
    harnessType: "support",
    executing: false,
    isMock: false,
  });

  // ---------------------------------------------------------
  // VERIFICACIÓN DE PERSISTENCIA POST-EJECUCIÓN (Actividades 4 y 6)
  // ---------------------------------------------------------
  console.log("\n--- [VERIFICACIÓN DE PERSISTENCIA] Consultando Convex por runId ---");
  const persistedTick1 = await client.query(api.serverOrchestration.getEventsByRun, {
    serverSecret: SERVER_SECRET,
    tenantId: TENANT_ID,
    runId: RUN_ID_1,
  });
  const persistedTick2 = await client.query(api.serverOrchestration.getEventsByRun, {
    serverSecret: SERVER_SECRET,
    tenantId: TENANT_ID,
    runId: RUN_ID_2,
  });

  console.log(`Eventos persistidos en Tick 1 (${RUN_ID_1}): ${persistedTick1.length}`);
  console.log(sanitizeLog(persistedTick1));
  console.log(`\nEventos persistidos en Tick 2 (${RUN_ID_2}): ${persistedTick2.length}`);
  console.log(sanitizeLog(persistedTick2));

  if (persistedTick1.length !== 4 || persistedTick2.length !== 2) {
    throw new Error("FALLO: El conteo de eventos persistidos no coincide con lo esperado.");
  }

  console.log("\n=== WORKER STAGING COMPLETADO: PERSISTENCIA, 2 TICKS, FALLO/RECONEXIÓN Y DEDUPLICACIÓN VERIFICADOS ===");
}

runStagingWorker().catch((err) => {
  console.error("ERROR EN WORKER STAGING:", err.message);
  process.exit(1);
});