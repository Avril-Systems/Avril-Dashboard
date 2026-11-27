#!/usr/bin/env node
/**
 * Registro reproducible de los cinco agentes de Avril · Swarmy.
 *
 * Uso en dev:
 *   node script/register-swarmy-agents.mjs --session-id=<sessionId>
 *
 * Uso en producción (sin ejecutar aquí):
 *   CONVEX_URL=https://outstanding-swordfish-684.convex.cloud \
 *   CONVEX_SERVER_SECRET=... \
 *   node script/register-swarmy-agents.mjs \
 *     --create-session --organization-id=<orgId> --company-name="Avril · Swarmy" --dry-run
 *
 * Idempotente: inserta/actualiza por agentKey y no borra agentes existentes.
 * No crea intenciones, no habilita metacognición y no arranca el worker.
 */
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

if (!process.env.CONVEX_URL && !process.env.NEXT_PUBLIC_CONVEX_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Sin archivo: se usan las variables del entorno.
  }
}

const AGENTS = [
  {
    agentKey: 'swarm-strategy',
    name: 'Orquestador',
    role: 'orchestrator',
    status: 'idle',
    meta: { orchestrator: true },
    x: 420,
    y: 20,
  },
  {
    agentKey: 'support',
    name: 'Soporte',
    role: 'support',
    status: 'idle',
    meta: { harnessType: 'support' },
    x: 120,
    y: 120,
  },
  {
    agentKey: 'b2b',
    name: 'B2B',
    role: 'b2b',
    status: 'idle',
    meta: { harnessType: 'b2b' },
    x: 320,
    y: 120,
  },
  {
    agentKey: 'prospecting',
    name: 'Prospección',
    role: 'prospecting',
    status: 'idle',
    meta: { harnessType: 'prospecting' },
    x: 520,
    y: 120,
  },
  {
    agentKey: 'marketing',
    name: 'Marketing',
    role: 'marketing',
    status: 'idle',
    meta: { harnessType: 'marketing' },
    x: 720,
    y: 120,
  },
];

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function argValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] || '';
  const prefix = `${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function printHelp() {
  console.log(`Uso:
  node script/register-swarmy-agents.mjs --session-id=<id> [--dry-run]
  node script/register-swarmy-agents.mjs --create-session --organization-id=<id> [--company-name="Avril · Swarmy"] [--dry-run]

Variables:
  CONVEX_URL | NEXT_PUBLIC_CONVEX_URL
  CONVEX_SERVER_SECRET

Agentes: ${AGENTS.map((agent) => agent.agentKey).join(', ')}.
No borra agentes existentes, no crea intenciones y no enciende el worker.`);
}

if (hasFlag('--help') || hasFlag('-h')) {
  printHelp();
  process.exit(0);
}

const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '';
const serverSecret = process.env.CONVEX_SERVER_SECRET || '';
const sessionId = argValue('--session-id').trim();
const createSession = hasFlag('--create-session');
const dryRun = hasFlag('--dry-run');
const organizationId = argValue('--organization-id').trim();
const companyName = argValue('--company-name').trim() || 'Avril · Swarmy';

if (!url || !serverSecret) {
  console.error('ERROR: faltan CONVEX_URL/NEXT_PUBLIC_CONVEX_URL o CONVEX_SERVER_SECRET.');
  process.exit(1);
}
if (!sessionId && !createSession) {
  console.error('ERROR: indica --session-id o --create-session.');
  printHelp();
  process.exit(2);
}
if (createSession && !organizationId) {
  console.error('ERROR: --create-session requiere --organization-id.');
  process.exit(2);
}

const client = new ConvexHttpClient(url);

function printAgents(agents) {
  console.log(`Agentes (${agents.length}):`);
  for (const agent of agents.sort((a, b) => a.agentKey.localeCompare(b.agentKey))) {
    console.log(
      `- ${agent.agentKey} · ${agent.name} · rol=${agent.role ?? '-'} · status=${agent.status} · meta=${JSON.stringify(agent.meta ?? {})}`
    );
  }
}

async function main() {
  console.log(`Convex: ${url.replace(/^https?:\/\//, '').split('.')[0]}…`);
  let targetSessionId = sessionId;

  if (!targetSessionId && createSession) {
    const sessions = await client.query(anyApi.serverOrchestration.listSessionsByOrgServer, {
      organizationId,
      serverSecret,
    });
    const existing = (sessions ?? []).find((session) => session.companyName === companyName);
    if (existing) {
      targetSessionId = existing._id;
      console.log(`Reutilizando sesión existente ${targetSessionId} ("${companyName}").`);
    } else if (dryRun) {
      console.log(`[dry-run] Crearía chat y sesión "${companyName}" en org ${organizationId}.`);
      console.log(`[dry-run] Registraría ${AGENTS.length} agentes:`);
      for (const agent of AGENTS) console.log(`- ${agent.agentKey} · ${agent.name} · ${agent.role}`);
      return;
    } else {
      const chatId = await client.mutation(anyApi.serverChats.createChatServer, {
        title: companyName,
        organizationId,
        serverSecret,
      });
      targetSessionId = await client.mutation(anyApi.serverOrchestration.createSessionServer, {
        organizationId,
        chatId,
        companyName,
        status: 'active',
        serverSecret,
      });
      console.log(`Sesión creada: ${targetSessionId} (chat ${chatId}).`);
    }
  }

  if (!targetSessionId) {
    console.error('ERROR: no hay sesión objetivo.');
    process.exit(1);
  }

  const session = await client.query(anyApi.serverOrchestration.getSessionServer, {
    sessionId: targetSessionId,
    serverSecret,
  });
  if (!session) {
    console.error(`ERROR: la sesión ${targetSessionId} no existe.`);
    process.exit(1);
  }

  if (dryRun) {
    const current = await client.query(anyApi.serverOrchestration.listSessionAgentsServer, {
      sessionId: targetSessionId,
      serverSecret,
    });
    console.log(`[dry-run] Sesión ${targetSessionId} ("${session.companyName}") sin cambios.`);
    console.log(`[dry-run] Registraría/actualizaría ${AGENTS.length} agentes:`);
    for (const agent of AGENTS) console.log(`- ${agent.agentKey} · ${agent.name} · ${agent.role}`);
    console.log(`[dry-run] Agentes actuales: ${(current ?? []).length}.`);
    return;
  }

  await client.mutation(anyApi.serverOrchestration.upsertAgentsSnapshotServer, {
    sessionId: targetSessionId,
    agents: AGENTS,
    serverSecret,
  });

  const agents = await client.query(anyApi.serverOrchestration.listSessionAgentsServer, {
    sessionId: targetSessionId,
    serverSecret,
  });
  console.log(`Sesión: ${targetSessionId} ("${session.companyName}").`);
  printAgents(agents ?? []);
}

main().catch((error) => {
  console.error('ERROR:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
