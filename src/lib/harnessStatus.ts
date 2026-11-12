/**
 * Lógica PURA para el panel de los 4 harnesses (Agent Office S00).
 * Separa tres cosas que NO son lo mismo:
 *   - registered: existe una fila de agente para ese harness
 *   - connected:  el canal está abierto (NO implica proceso permanente)
 *   - executing:  está ejecutando trabajo ahora mismo
 * Si el payload no trae el dato, el valor es null ("desconocido"), nunca false inventado.
 *
 * Contrato (meta del agente, vía upsertAgentsSnapshotServer / updateAgentStatusServer):
 *   { harnessType, connected?: boolean, executing?: boolean, lastHeartbeatAt?: ISO, isMock?: boolean }
 *
 * ASUMIDO (confirmar con Alejandro): los 4 harnesses son los arneses C2.
 */

import type { Origin } from './handoffChain.ts';

export type AgentRow = {
  agentKey: string;
  name: string;
  role?: string;
  status: string;
  meta?: unknown;
};

export const EXPECTED_HARNESSES = [
  { key: 'support', label: 'Soporte' },
  { key: 'b2b', label: 'B2B' },
  { key: 'prospecting', label: 'Prospección' },
  { key: 'marketing', label: 'Marketing' },
] as const;

export type HarnessView = {
  key: string;
  label: string;
  registered: boolean;
  connected: boolean | null;
  executing: boolean | null;
  stale: boolean;
  lastHeartbeatAt?: string;
  agentKey?: string;
  origin: Origin;
};

export const HEARTBEAT_STALE_MS = 60000;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function matches(agent: AgentRow, key: string): boolean {
  const meta = asRecord(agent.meta);
  const declared = str(meta.harnessType) ?? str(meta.harness);
  if (declared) return declared === key;
  return agent.agentKey === key || agent.agentKey.startsWith(key + ':') || agent.agentKey.startsWith(key + '-');
}

export function deriveHarnesses(
  agents: AgentRow[],
  nowMs: number,
  staleMs: number = HEARTBEAT_STALE_MS
): { harnesses: HarnessView[]; unmatchedAgents: number } {
  const used = new Set<string>();

  const harnesses = EXPECTED_HARNESSES.map((def): HarnessView => {
    const agent = agents.find((a) => !used.has(a.agentKey) && matches(a, def.key));
    if (!agent) {
      return {
        key: def.key,
        label: def.label,
        registered: false,
        connected: false,
        executing: false,
        stale: false,
        origin: 'unknown',
      };
    }
    used.add(agent.agentKey);
    const meta = asRecord(agent.meta);
    const connected = boolOrNull(meta.connected);
    const lastHeartbeatAt = str(meta.lastHeartbeatAt);
    const hb = lastHeartbeatAt ? Date.parse(lastHeartbeatAt) : NaN;
    const stale = connected === true && Number.isFinite(hb) && nowMs - hb > staleMs;
    return {
      key: def.key,
      label: def.label,
      registered: true,
      connected,
      executing: boolOrNull(meta.executing),
      stale,
      lastHeartbeatAt,
      agentKey: agent.agentKey,
      origin: meta.isMock === true ? 'mock' : meta.isMock === false ? 'real' : 'unknown',
    };
  });

  return { harnesses, unmatchedAgents: agents.filter((a) => !used.has(a.agentKey)).length };
}
