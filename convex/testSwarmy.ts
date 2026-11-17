import { action } from "./_generated/server";
import { api } from "./_generated/api";

export const runTests = action({
  args: {},
  handler: async (ctx) => {
    const validSecret = process.env.CONVEX_SERVER_SECRET;
    if (!validSecret) {
      throw new Error("Falta CONVEX_SERVER_SECRET en el entorno de Convex.");
    }

    console.log("=== INICIANDO SUITE DE TESTS W46 P0 (SEGURIDAD + AISLAMIENTO) ===");

    // TEST 1: Acceso anónimo / secreto inválido debe ser denegado
    console.log("\n[TEST 1] Validando rechazo de acceso no autorizado...");
    let unauthorizedBlocked = false;
    try {
      await ctx.runMutation(api.serverOrchestration.ingestEvent, {
        serverSecret: "secreto_falso_123",
        version: "v1.0",
        tenantId: "TENANT_A",
        workspaceId: "ws_A",
        runId: "run_unauth",
        eventType: "support.report.received",
        payload: { isMock: true },
        idempotencyKey: "idem_unauth",
        humanApprovalRequired: false,
      });
    } catch (err) {
      unauthorizedBlocked = true;
      console.log("PASS - Escritura anónima bloqueada:", (err as Error).message);
    }
    if (!unauthorizedBlocked) {
      throw new Error("FAIL - Se permitió escribir con un secreto inválido.");
    }

    // TEST 2: Escritura en Tenant A e Idempotencia por Tenant
    console.log("\n[TEST 2] Validando escritura e idempotencia por tenant...");
    const resA1 = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      serverSecret: validSecret,
      version: "v1.0",
      tenantId: "TENANT_A",
      workspaceId: "ws_A",
      runId: "run_test_A",
      eventType: "support.report.received",
      payload: { ticketId: "T-01", isMock: true },
      idempotencyKey: "shared_idem_key_001",
      humanApprovalRequired: false,
    });
    console.log("Tenant A (1er envío):", resA1.status);

    const resA2 = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      serverSecret: validSecret,
      version: "v1.0",
      tenantId: "TENANT_A",
      workspaceId: "ws_A",
      runId: "run_test_A",
      eventType: "support.report.received",
      payload: { ticketId: "T-01", isMock: true },
      idempotencyKey: "shared_idem_key_001",
      humanApprovalRequired: false,
    });
    console.log("Tenant A (duplicado):", resA2.status);
    if (resA2.status !== "idempotent_hit") {
      throw new Error("FAIL - No se deduplicó el evento repetido en Tenant A.");
    }

    // Misma idempotencyKey en Tenant B SÍ debe permitirse (aislamiento de llaves)
    const resB1 = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      serverSecret: validSecret,
      version: "v1.0",
      tenantId: "TENANT_B",
      workspaceId: "ws_B",
      runId: "run_test_B",
      eventType: "handoff.created",
      payload: { handoffId: "h-B", isMock: true },
      idempotencyKey: "shared_idem_key_001",
      humanApprovalRequired: true,
    });
    console.log("Tenant B (misma llave en otro tenant):", resB1.status);
    if (resB1.status !== "success") {
      throw new Error("FAIL - La idempotencia de Tenant A bloqueó a Tenant B.");
    }

    // TEST 3: Aislamiento de lectura (Tenant B no puede leer run_test_A)
    console.log("\n[TEST 3] Validando aislamiento de lectura cruzada...");
    const leakCheck = await ctx.runQuery(api.serverOrchestration.getEventsByRun, {
      serverSecret: validSecret,
      tenantId: "TENANT_B",
      runId: "run_test_A",
    });
    console.log("Eventos de Tenant A visibles para Tenant B:", leakCheck.length);
    if (leakCheck.length !== 0) {
      throw new Error("FAIL - Fuga de datos entre tenants detectada.");
    }

    const ownCheck = await ctx.runQuery(api.serverOrchestration.getEventsByRun, {
      serverSecret: validSecret,
      tenantId: "TENANT_A",
      runId: "run_test_A",
    });
    console.log("Eventos propios de Tenant A recuperados:", ownCheck.length);

    // TEST 4: Heartbeats de los 4 harnesses aislados por tenant
    console.log("\n[TEST 4] Validando 4 conexiones (heartbeats) coordinadas...");
    const harnesses = ["support", "b2b", "prospecting", "marketing"];
    for (const h of harnesses) {
      await ctx.runMutation(api.serverOrchestration.pingConnection, {
        serverSecret: validSecret,
        connectionId: h,
        tenantId: "TENANT_A",
        harnessType: h,
        executing: h === "support",
        isMock: true,
      });
    }
    const connsA = await ctx.runQuery(api.serverOrchestration.getActiveConnections, {
      serverSecret: validSecret,
      tenantId: "TENANT_A",
    });
    const connsB = await ctx.runQuery(api.serverOrchestration.getActiveConnections, {
      serverSecret: validSecret,
      tenantId: "TENANT_B",
    });
    console.log(`Conexiones activas -> Tenant A: ${connsA.length}, Tenant B: ${connsB.length}`);
    if (connsA.length !== 4 || connsB.length !== 0) {
      throw new Error("FAIL - Aislamiento de conexiones incorrecto.");
    }

    console.log("\n=== TODOS LOS TESTS DE SEGURIDAD Y CONTRATO PASARON (PASS) ===");
    return { success: true };
  },
});