import { action } from "./_generated/server";
import { api } from "./_generated/api";

export const runTests = action({
  args: {},
  handler: async (ctx) => {
    console.log("--- INICIANDO PRUEBA S00 (ALEJANDRO) ---");

    // 1. Simular Tenant A (Cliente 1)
    console.log("1. Insertando evento de Tenant A...");
    const resultA1 = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      version: "v1.0",
      tenantId: "TENANT_A_SINTETICO",
      workspaceId: "ws_A",
      runId: "run_001",
      eventType: "support.report.received", // <--- ACTUALIZADO AL NUEVO CONTRATO
      payload: { accion: "iniciar_agente_deepseek", datos: "ok" },
      idempotencyKey: "idem_key_001",
      humanApprovalRequired: true
    });
    console.log("Resultado A1:", resultA1);

    // 2. Probar Idempotencia (Simular que la red falló y se reenvió el mismo evento)
    console.log("\n2. Probando IDEMPOTENCIA (mismo evento, misma llave)...");
    const resultA2 = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      version: "v1.0",
      tenantId: "TENANT_A_SINTETICO",
      workspaceId: "ws_A",
      runId: "run_001",
      eventType: "support.report.received", // <--- ACTUALIZADO AL NUEVO CONTRATO
      payload: { accion: "iniciar_agente_deepseek", datos: "ok" },
      idempotencyKey: "idem_key_001", // <--- Misma llave exacta
      humanApprovalRequired: true
    });
    console.log("Resultado A2 (Debería decir 'Evento ignorado'):", resultA2);

    // 3. Simular Tenant B (Aislamiento de clientes)
    console.log("\n3. Insertando evento de Tenant B (Aislamiento)...");
    const resultB1 = await ctx.runMutation(api.serverOrchestration.ingestEvent, {
      version: "v1.0",
      tenantId: "TENANT_B_SINTETICO",
      workspaceId: "ws_B",
      runId: "run_999",
      eventType: "diagnosis.ready", // <--- ACTUALIZADO AL NUEVO CONTRATO
      payload: { accion: "validar_codigo_nemotron" },
      idempotencyKey: "idem_key_B_001", // Llave nueva
      humanApprovalRequired: false
    });
    console.log("Resultado B1:", resultB1);

    console.log("\n--- PRUEBAS COMPLETADAS. ---");
    
    // --- PRUEBA DE LAS 4 CONEXIONES OBSERVABLES ---
    console.log("\n4. Simulando 4 conexiones (Heartbeats)...");
    await ctx.runMutation(api.serverOrchestration.pingConnection, { connectionId: "worker_1", tenantId: "ws_A" });
    await ctx.runMutation(api.serverOrchestration.pingConnection, { connectionId: "worker_2", tenantId: "ws_A" });
    await ctx.runMutation(api.serverOrchestration.pingConnection, { connectionId: "worker_3", tenantId: "ws_B" });
    await ctx.runMutation(api.serverOrchestration.pingConnection, { connectionId: "worker_4", tenantId: "ws_B" });

    console.log("¡4 conexiones registradas exitosamente sin procesos persistentes!");
    return { success: true };
  }
});