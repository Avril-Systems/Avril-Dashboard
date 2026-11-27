import { action } from "./_generated/server";
import { api } from "./_generated/api";

export const runTests = action({
  args: {},
  handler: async (ctx) => {
    const validSecret = process.env.CONVEX_SERVER_SECRET;
    if (!validSecret) {
      throw new Error("Falta CONVEX_SERVER_SECRET en el entorno de Convex.");
    }

    const suffix = Date.now();
    const runIdA = `run_test_A_${suffix}`;
    const runIdB = `run_test_B_${suffix}`;
    const sharedKey = `idem_shared_${suffix}`;

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
      runId: runIdA,
      eventType: "support.report.received",
      payload: { ticketId: "T-01", isMock: true },
      idempotencyKey: sharedKey,
      humanApprovalRequired: false,
    });
    console.log("Tenant A (1er envío):", resA1.status);
    if (resA1.status !== "success") {
      throw new Error("FAIL - El primer envío de Tenant A no se insertó.");
    }

    const resA2 = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      serverSecret: validSecret,
      version: "v1.0",
      tenantId: "TENANT_A",
      workspaceId: "ws_A",
      runId: runIdA,
      eventType: "support.report.received",
      payload: { ticketId: "T-01", isMock: true },
      idempotencyKey: sharedKey,
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
      runId: runIdB,
      eventType: "handoff.created",
      payload: { handoffId: "h-B", isMock: true },
      idempotencyKey: sharedKey,
      humanApprovalRequired: true,
    });
    console.log("Tenant B (misma llave en otro tenant):", resB1.status);
    if (resB1.status !== "success") {
      throw new Error("FAIL - La idempotencia de Tenant A bloqueó a Tenant B.");
    }

    // TEST 3: Aislamiento de lectura (Tenant B no puede leer runIdA)
    console.log("\n[TEST 3] Validando aislamiento de lectura cruzada...");
    const leakCheck = await ctx.runQuery(api.serverOrchestration.getEventsByRun, {
      serverSecret: validSecret,
      tenantId: "TENANT_B",
      runId: runIdA,
    });
    console.log("Eventos de Tenant A visibles para Tenant B:", leakCheck.length);
    if (leakCheck.length !== 0) {
      throw new Error("FAIL - Fuga de datos entre tenants detectada.");
    }

    const ownCheck = await ctx.runQuery(api.serverOrchestration.getEventsByRun, {
      serverSecret: validSecret,
      tenantId: "TENANT_A",
      runId: runIdA,
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

    // TEST 5: Registro de tool.call.completed y aislamiento entre tenants
    console.log("\n[TEST 5] Validando tool.call.completed y aislamiento...");
    const toolRunId = `run_tool_${suffix}`;
    const toolRes = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      serverSecret: validSecret,
      version: "v1.0",
      tenantId: "TENANT_A",
      workspaceId: "ws_A",
      runId: toolRunId,
      eventType: "tool.call.completed",
      payload: {
        extension: "github-mcp-server",
        harnessType: "openclaw",
        tool: "get_file_contents",
        requestId: `req_${suffix}`,
        httpStatus: 200,
        responseHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        credentialRef: "GITHUB_SANDBOX_PAT_RO",
        isMock: false,
        sandbox: true,
      },
      idempotencyKey: `idem_tool_${suffix}`,
      humanApprovalRequired: false,
    });
    if (toolRes.status !== "success") {
      throw new Error("FAIL - No se registró tool.call.completed en Tenant A.");
    }

    const toolLeakCheck = await ctx.runQuery(api.serverOrchestration.getEventsByRun, {
      serverSecret: validSecret,
      tenantId: "TENANT_B",
      runId: toolRunId,
    });
    console.log("Eventos tool.call.completed visibles para Tenant B:", toolLeakCheck.length);
    if (toolLeakCheck.length !== 0) {
      throw new Error("FAIL - Fuga de tool.call.completed hacia Tenant B.");
    }

    console.log("\n=== TODOS LOS TESTS DE SEGURIDAD Y CONTRATO PASARON (PASS) ===");
    return { success: true };
  },
});