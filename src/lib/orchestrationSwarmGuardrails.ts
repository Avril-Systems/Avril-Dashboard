/** Top-level swarm orchestrations OpenClaw should spin up per ignition (business guardrail). */
export const SWARM_ORCHESTRATION_COUNT = 3;

/** Max subagents per swarm (orchestrator + workers), MVP cap. */
export const MAX_SUBAGENTS_PER_SWARM = 3;

/** Soft cap on total agents across all swarms for MVP. */
export const MAX_TOTAL_AGENTS_MVP = 12;

/**
 * Detects a Venice-generated company brief pasted/sent as the user message.
 * Matches legacy folder cards ("# Agent brief …") and folder-profile-prompt output
 * (venture title + Runtime topology section).
 */
export function isFolderAgentBriefMessage(message: string): boolean {
  const t = message.trim();
  if (t.length < 80) return false;
  if (/#\s*Agent brief\b/i.test(t) || /\bAgent brief\s*[·\.]/i.test(t)) return true;
  return /^#\s+\S/m.test(t) && /runtime\s+topology/i.test(t);
}

/**
 * Prepended to every payload sent to the OpenClaw bridge so runtimes don't explode into 40+ agents.
 */
export function appendSwarmGuardrailsToIgnitionPrompt(prompt: string): string {
  const header = `[Business OS guardrails \u2014 REQUIRED; do not ignore]
- Create exactly ${SWARM_ORCHESTRATION_COUNT} swarm orchestrations (three top-level squads/orchestrators). Do not spawn dozens of independent agents.
- Each swarm: one orchestrator plus at most ${MAX_SUBAGENTS_PER_SWARM} workers/subagents.
- Total agents across all swarms \u2264 ${MAX_TOTAL_AGENTS_MVP} for this MVP ignition unless a human operator explicitly approves expansion.
- Prefer fewer, deeper workflows over many shallow agents.

--- Founder ignition prompt ---

`;
  return header + prompt.trim();
}

// ── Default 3-swarm topology seeded into Convex after spawn ──

type SwarmDef = {
  id: string;
  name: string;
  role: string;
  workers: Array<{ id: string; name: string; role: string }>;
};

const DEFAULT_SWARMS: SwarmDef[] = [
  {
    id: 'swarm-strategy',
    name: 'Strategy Orchestrator',
    role: 'Strategy & Planning',
    workers: [
      { id: 'sw1-research', name: 'Research Agent', role: 'Market research & data gathering' },
      { id: 'sw1-analyst', name: 'Business Analyst', role: 'Metrics, KPI tracking & reporting' },
    ],
  },
  {
    id: 'swarm-ops',
    name: 'Operations Orchestrator',
    role: 'Operations & Execution',
    workers: [
      { id: 'sw2-builder', name: 'Builder Agent', role: 'Task execution & implementation' },
      { id: 'sw2-qa', name: 'QA Agent', role: 'Quality checks & compliance' },
    ],
  },
  {
    id: 'swarm-growth',
    name: 'Growth Orchestrator',
    role: 'Growth & Outreach',
    workers: [
      { id: 'sw3-content', name: 'Content Agent', role: 'Content creation & comms' },
      { id: 'sw3-outreach', name: 'Outreach Agent', role: 'Distribution & partnerships' },
    ],
  },
];

export type SeedAgent = {
  agentKey: string;
  parentAgentKey?: string;
  name: string;
  role: string;
  status: 'spawning' | 'idle';
};

function slugifyAgentKey(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

function cleanAgentLabel(raw: string): string {
  return raw
    .replace(/^\*+|\*+$/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^\d+[\).\]]\s*/, '')
    .replace(/^agent\s*\d+\s*[:\-–]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFlatAgentList(prompt: string): string[] {
  const named = prompt.match(/^(?:agents|included agents)\s*[:\-–]\s*(.+)$/im)?.[1];
  if (named) {
    return named
      .split(/[,|/·•]/)
      .map((s) => cleanAgentLabel(s))
      .filter((s) => s.length >= 2 && s.length <= 60);
  }
  return [];
}

/**
 * Parse company-specific swarm topology from a Venice / form ignition prompt.
 * Supports formats like:
 *   - Squad 1: Customer Acquisition …
 *     - Agent 1: Digital Marketing Specialist
 *   - *Service Operations (3 agents)*
 *     - Scheduling & Dispatch Coordinator
 * Falls back to null when topology cannot be inferred.
 */
export function parseSwarmDefsFromIgnitionPrompt(prompt: string): SwarmDef[] | null {
  const text = prompt.trim();
  if (!text) return null;

  const topologyMatch = text.match(
    /(?:runtime\s+topology|swarm\s+orchestration|orchestrator(?:s)?)\s*[:\*]?\s*\n([\s\S]{40,8000})/i,
  );
  const section = topologyMatch?.[1] ?? text;
  const lines = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const squads: Array<{ name: string; workers: string[] }> = [];
  let current: { name: string; workers: string[] } | null = null;

  const squadRe =
    /^(?:[-*•]\s*)?(?:\*{0,2})(?:squad|swarm|orchestrator)\s*\d*\s*[:\-–.]?\s*(.+?)(?:\s*\(\s*\d+\s*agents?\s*\))?\*{0,2}$/i;
  const italicSquadRe = /^\*{1,2}([^*]{3,80}?)\*{1,2}$/;
  const workerRe = /^(?:[-*•]\s+|\d+[\).\]]\s+|agent\s*\d+\s*[:\-–]\s*)(.+)$/i;

  for (const line of lines) {
    if (/instantiate exactly|total agents|do not design|mvp/i.test(line) && !squadRe.test(line)) {
      continue;
    }

    const squadHit = line.match(squadRe);
    if (squadHit?.[1]) {
      if (current && (current.workers.length > 0 || squads.length === 0)) squads.push(current);
      current = { name: cleanAgentLabel(squadHit[1]), workers: [] };
      continue;
    }

    // Venice often emits *Customer Acquisition & Retention (3 agents)*
    const italic = line.match(italicSquadRe);
    if (italic?.[1] && /\bagents?\b/i.test(italic[1])) {
      if (current) squads.push(current);
      current = {
        name: cleanAgentLabel(italic[1].replace(/\(\s*\d+\s*agents?\s*\)/i, '')),
        workers: [],
      };
      continue;
    }

    const workerHit = line.match(workerRe);
    if (workerHit?.[1] && current) {
      const name = cleanAgentLabel(workerHit[1]);
      if (
        name &&
        !/^(squad|swarm|orchestrator|runtime|instantiate)/i.test(name) &&
        name.length <= 60
      ) {
        current.workers.push(name);
      }
    }
  }
  if (current) squads.push(current);

  const meaningful = squads
    .map((s) => ({
      name: s.name,
      workers: s.workers.slice(0, MAX_SUBAGENTS_PER_SWARM),
    }))
    .filter((s) => s.name.length >= 2)
    .slice(0, SWARM_ORCHESTRATION_COUNT);

  if (meaningful.length >= 1 && meaningful.some((s) => s.workers.length > 0)) {
    return meaningful.map((s, i) => ({
      id: `swarm-${slugifyAgentKey(s.name, `s${i + 1}`)}`,
      name: /orchestrator/i.test(s.name) ? s.name : `${s.name} Orchestrator`,
      role: s.name,
      workers: s.workers.map((w, j) => ({
        id: `sw${i + 1}-${slugifyAgentKey(w, `w${j + 1}`)}`,
        name: w,
        role: w,
      })),
    }));
  }

  // Form path: "Agents: Scout, Analyst, Brief Writer"
  const flat = parseFlatAgentList(text);
  if (flat.length >= 2) {
    const buckets: string[][] = [[], [], []];
    flat.slice(0, MAX_TOTAL_AGENTS_MVP - SWARM_ORCHESTRATION_COUNT).forEach((name, i) => {
      buckets[i % SWARM_ORCHESTRATION_COUNT].push(name);
    });
    const labels = ['Strategy', 'Operations', 'Growth'];
    return labels.map((label, i) => ({
      id: `swarm-${label.toLowerCase()}`,
      name: `${label} Orchestrator`,
      role: label,
      workers: buckets[i].slice(0, MAX_SUBAGENTS_PER_SWARM).map((w, j) => ({
        id: `sw${i + 1}-${slugifyAgentKey(w, `w${j + 1}`)}`,
        name: w,
        role: w,
      })),
    }));
  }

  return null;
}

function swarmDefsToSeedAgents(swarms: SwarmDef[]): SeedAgent[] {
  const agents: SeedAgent[] = [];
  for (const swarm of swarms) {
    agents.push({
      agentKey: swarm.id,
      name: swarm.name,
      role: swarm.role,
      status: 'spawning',
    });
    for (const worker of swarm.workers) {
      agents.push({
        agentKey: worker.id,
        parentAgentKey: swarm.id,
        name: worker.name,
        role: worker.role,
        status: 'idle',
      });
    }
  }
  return agents.slice(0, MAX_TOTAL_AGENTS_MVP);
}

/**
 * Returns the flat agent list (3 orchestrators + workers) to seed into Convex
 * immediately after a successful spawn so the Office shows the real topology.
 */
export function buildDefaultSwarmAgents(): SeedAgent[] {
  return swarmDefsToSeedAgents(DEFAULT_SWARMS);
}

/**
 * Prefer company-specific agents from the ignition prompt; fall back to the
 * generic Strategy/Ops/Growth template when topology cannot be parsed.
 */
export function buildSwarmAgentsForPrompt(prompt: string | undefined | null): SeedAgent[] {
  const parsed = prompt ? parseSwarmDefsFromIgnitionPrompt(prompt) : null;
  if (parsed && parsed.length > 0) return swarmDefsToSeedAgents(parsed);
  return buildDefaultSwarmAgents();
}
