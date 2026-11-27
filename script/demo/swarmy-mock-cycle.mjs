// Siembra un run MOCK de Swarmy en TU Convex de desarrollo, usando ingestEvent / pingConnection de Alejandro.
// Todo lleva isMock:true y el runId empieza con "run_mock_": no finge ejecución real.
//
// Uso (desde la raíz del repo, con el código de Alejandro ya desplegado en tu Convex de desarrollo):
//   node --env-file=.env.local script/demo/swarmy-mock-cycle.mjs [escenario] [--dry-run] [--keepalive]
//
// Escenarios:
//   chain               (por defecto) cadena completa de 7 pasos + latidos de los 4 harnesses
//   partial             cadena detenida tras el ACK
//   pause-unconfirmed   comando pause enviado SIN confirmación (la UI debe acabar en "Sin confirmar")
//   pause-confirmed     comando pause + agent.paused de confirmación
//   kill-confirmed      comando kill + agent.stopped de confirmación
//
//   --keepalive         al terminar, renueva los latidos mock cada 20 s hasta Ctrl+C (para ver 'conectado' en vez de 'stale')
//
// Seguridad: se niega a escribir si CONVEX_DEPLOYMENT no empieza con "dev:". No imprime secretos.
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const keepalive = argv.includes('--keepalive');
const scenario = argv.find((a) => !a.startsWith('--')) ?? 'chain';
const SCENARIOS = ['chain', 'partial', 'pause-unconfirmed', 'pause-confirmed', 'kill-confirmed'];
if (!SCENARIOS.includes(scenario)) {
  console.error(`Escenario desconocido: "${scenario}". Opciones: ${SCENARIOS.join(', ')}`);
  process.exit(2);
}

const deployment = process.env.CONVEX_DEPLOYMENT ?? '';
const url = process.env.SWARMY_CONVEX_URL || process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
const serverSecret = process.env.SWARMY_CONVEX_SERVER_SECRET || process.env.CONVEX_SERVER_SECRET;
const tenantId = process.env.SWARMY_TENANT_ID;
const workspaceId = process.env.SWARMY_WORKSPACE_ID;

if (!dryRun) {
  if (!deployment.startsWith('dev:')) {
    console.error('Me niego a escribir: CONVEX_DEPLOYMENT no empieza con "dev:".');
    process.exit(2);
  }
  const missing = [];
  if (!url) missing.push('CONVEX_URL / NEXT_PUBLIC_CONVEX_URL');
  if (!serverSecret) missing.push('CONVEX_SERVER_SECRET');
  if (!tenantId) missing.push('SWARMY_TENANT_ID');
  if (!workspaceId) missing.push('SWARMY_WORKSPACE_ID');
  if (missing.length) {
    console.error(`Faltan variables (usa --env-file=.env.local): ${missing.join(', ')}`);
    process.exit(2);
  }
}

const tag = Date.now().toString(36);
const runId = `run_mock_${scenario.replace(/[^a-z]/g, '')}_${tag}`;
const handoffId = `hoff_mock_${tag}`;
const ticketId = `MOCK-${tag.toUpperCase()}`;
const base = { isMock: true };

const chain = [
  ['support.report.received', { ticketId, severity: 'high', source: 'mock-cycle', ...base }],
  ['handoff.created', { handoffId, ticketId, from: 'support', to: 'deepseek', ...base }],
  ['handoff.ack', { handoffId, ackAt: new Date().toISOString(), ...base }],
  ['diagnosis.ready', { handoffId, summary: 'Diagnóstico SIMULADO (mock)', ...base }],
  ['patch.proposed', { handoffId, prRef: 'MOCK-PR-0', ...base }],
  ['approval.decided', { handoffId, decision: 'approved', decidedBy: 'mock-approver', ...base }],
  ['run.result', { handoffId, outcome: 'ok', ...base }],
];

const control = (command, confirmType) => {
  const steps = [['agent.command.sent', { agentKey: 'support', command, requestedVia: 'mock-cycle', ...base }]];
  if (confirmType) steps.push([confirmType, { agentKey: 'support', ...base }]);
  return steps;
};

const PLANS = {
  chain: chain,
  partial: chain.slice(0, 3),
  'pause-unconfirmed': [chain[0], chain[1], ...control('pause')],
  'pause-confirmed': [chain[0], chain[1], ...control('pause', 'agent.paused')],
  'kill-confirmed': [chain[0], chain[1], ...control('kill', 'agent.stopped')],
};
const plan = PLANS[scenario];
const HARNESSES = ['support', 'b2b', 'prospecting', 'marketing'];

console.log(`Escenario: ${scenario}${dryRun ? ' (dry-run: no escribe)' : ''}`);
console.log(`runId: ${runId}`);
console.log(`Deployment: ${deployment ? deployment.split(' ')[0].split(':')[0] + ':…' : '(no definido)'}`);
console.log(`Eventos: ${plan.length} · latidos mock: ${HARNESSES.length}`);

if (dryRun) {
  for (const [type] of plan) console.log(`  (dry) ${type}`);
  process.exit(0);
}

const client = new ConvexHttpClient(url);
for (const h of HARNESSES) {
  await client.mutation(anyApi.serverOrchestration.pingConnection, {
    serverSecret, connectionId: h, tenantId, harnessType: h, executing: h === 'support', isMock: true,
  });
}
console.log('  latidos mock registrados');

let i = 0;
for (const [eventType, payload] of plan) {
  i += 1;
  const res = await client.mutation(anyApi.serverOrchestration.ingestEvent, {
    serverSecret,
    version: 'v1.0',
    tenantId,
    workspaceId,
    runId,
    eventType,
    payload,
    idempotencyKey: `idem_${runId}_${i}`,
    humanApprovalRequired: false,
    ...(eventType === 'patch.proposed' ? { prRef: payload.prRef } : {}),
  });
  console.log(`  -> ${eventType} => ${res?.status ?? 'ok'}`);
  await new Promise((r) => setTimeout(r, 150));
}
console.log(`Listo. Abre /agents/swarmy?runId=${runId}`);

if (keepalive) {
  console.log('Renovando latidos mock cada 20 s. Ctrl+C para terminar (a los 60 s sin latido volverán a Stale).');
  const beat = async () => {
    for (const h of HARNESSES) {
      await client.mutation(anyApi.serverOrchestration.pingConnection, {
        serverSecret, connectionId: h, tenantId, harnessType: h, executing: h === 'support', isMock: true,
      });
    }
    console.log(`  latido ${new Date().toLocaleTimeString()}`);
  };
  setInterval(() => beat().catch((e) => console.error('latido falló:', e?.message ?? e)), 20000);
}
