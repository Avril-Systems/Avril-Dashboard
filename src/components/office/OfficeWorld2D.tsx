'use client';

import { useMemo } from 'react';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { cn } from '@/lib/utils';

type AgentStatus = 'spawning' | 'idle' | 'working' | 'blocked' | 'completed' | 'error';

type AgentNode = {
  _id: string;
  agentKey: string;
  parentAgentKey?: string;
  name: string;
  role?: string;
  status: AgentStatus;
  x?: number;
  y?: number;
};

type WorldAgent = {
  id: string;
  agentKey: string;
  parentAgentKey?: string;
  name: string;
  role: string;
  status: AgentStatus;
  x: number;
  y: number;
  ensName?: string;
  description?: string;
  isMock?: boolean;
};

const MOCK_AGENTS: WorldAgent[] = [
  {
    id: 'arkhe',
    agentKey: 'arkhe',
    name: 'ARKHE',
    role: 'Ethics Analyzer',
    status: 'working',
    x: 200,
    y: 150,
    ensName: 'arkhe.avril.eth',
    description: 'Evaluating ethical frameworks',
    isMock: true,
  },
  {
    id: 'lumen',
    agentKey: 'lumen',
    parentAgentKey: 'arkhe',
    name: 'LUMEN',
    role: 'Clinical Context',
    status: 'idle',
    x: 500,
    y: 150,
    ensName: 'lumen.avril.eth',
    description: 'ACA methodology active',
    isMock: true,
  },
  {
    id: 'flux',
    agentKey: 'flux',
    parentAgentKey: 'arkhe',
    name: 'FLUX',
    role: 'Treasury',
    status: 'working',
    x: 350,
    y: 320,
    ensName: 'flux.avril.eth',
    description: 'Processing payments',
    isMock: true,
  },
  {
    id: 'vera',
    agentKey: 'vera',
    name: 'VERA',
    role: 'Identity',
    status: 'idle',
    x: 100,
    y: 320,
    ensName: 'vera.avril.eth',
    description: 'Verifying credentials',
    isMock: true,
  },
  {
    id: 'cirq',
    agentKey: 'cirq',
    name: 'CIRQ',
    role: 'Infrastructure',
    status: 'error',
    x: 600,
    y: 320,
    ensName: 'cirq.avril.eth',
    description: 'Retrying connection',
    isMock: true,
  },
];

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  idle: 'bg-emerald-400',
  working: 'bg-amber-400',
  error: 'bg-rose-400',
  spawning: 'bg-blue-400',
  completed: 'bg-teal-400',
  blocked: 'bg-amber-500',
};

const ROLE_AVATAR_CLASS: Record<string, string> = {
  'Ethics Analyzer': 'from-violet-500 to-fuchsia-500',
  'Clinical Context': 'from-cyan-500 to-blue-500',
  Treasury: 'from-amber-500 to-orange-500',
  Identity: 'from-emerald-500 to-teal-500',
  Infrastructure: 'from-rose-500 to-red-500',
  'Strategy & Planning': 'from-violet-500 to-indigo-500',
  'Operations & Execution': 'from-amber-500 to-orange-500',
  'Growth & Outreach': 'from-emerald-500 to-cyan-500',
  'Market research & data gathering': 'from-blue-400 to-indigo-400',
  'Metrics, KPI tracking & reporting': 'from-purple-400 to-violet-400',
  'Task execution & implementation': 'from-yellow-500 to-amber-400',
  'Quality checks & compliance': 'from-orange-400 to-rose-400',
  'Content creation & comms': 'from-teal-400 to-emerald-400',
  'Distribution & partnerships': 'from-cyan-400 to-blue-400',
};

function withLayout(agents: AgentNode[]): WorldAgent[] {
  const centerX = 420;
  const centerY = 260;

  return agents.map((agent, i) => {
    const hasCoords = typeof agent.x === 'number' && typeof agent.y === 'number';
    const angle = (Math.PI * 2 * i) / Math.max(agents.length, 1);
    const radius = 180 + (i % 3) * 42;

    return {
      id: agent._id,
      agentKey: agent.agentKey,
      parentAgentKey: agent.parentAgentKey,
      name: agent.name,
      role: agent.role || 'Agent',
      status: agent.status,
      x: hasCoords ? (agent.x as number) : Math.round(centerX + Math.cos(angle) * radius),
      y: hasCoords ? (agent.y as number) : Math.round(centerY + Math.sin(angle) * radius),
      ensName: `${agent.agentKey}.agent`,
      description: agent.role ? `${agent.role} active` : 'Agent active',
      isMock: false,
    };
  });
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function OfficeWorld2D({
  agents,
  selectedAgentKey,
  onSelectAgent,
}: {
  agents: AgentNode[];
  selectedAgentKey?: string | null;
  onSelectAgent: (agentKey: string) => void;
}) {
  const hasRealAgents = agents.length > 0;

  const worldAgents = useMemo(() => {
    if (!hasRealAgents) return MOCK_AGENTS;
    return withLayout(agents);
  }, [agents, hasRealAgents]);

  const byKey = useMemo(
    () => new Map(worldAgents.map((agent) => [agent.agentKey, agent])),
    [worldAgents]
  );

  const links = useMemo(() => {
    if (!hasRealAgents) {
      return [
        { parent: 'arkhe', child: 'lumen' },
        { parent: 'arkhe', child: 'flux' },
      ];
    }
    return worldAgents
      .filter((a) => a.parentAgentKey)
      .map((a) => ({ parent: a.parentAgentKey as string, child: a.agentKey }));
  }, [worldAgents, hasRealAgents]);

  return (
    <GlassPanel className="p-3">
      <div className="relative h-[620px] w-full overflow-auto rounded-xl border border-border/60 bg-[var(--avril-canvas)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_0%,oklch(0.62_0.14_210/0.10),transparent_55%),radial-gradient(800px_500px_at_100%_100%,oklch(0.62_0.14_210/0.06),transparent_50%)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--avril-grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--avril-grid-line) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {links.map((link) => {
            const parent = byKey.get(link.parent);
            const child = byKey.get(link.child);
            if (!parent || !child) return null;

            return (
              <line
                key={`${link.parent}->${link.child}`}
                x1={parent.x + 76}
                y1={parent.y + 56}
                x2={child.x + 76}
                y2={child.y + 56}
                stroke="rgba(0, 153, 175, 0.45)"
                strokeWidth="1.5"
                strokeDasharray={hasRealAgents ? undefined : '5 4'}
              />
            );
          })}
        </svg>

        {worldAgents.map((agent) => {
          const selected = selectedAgentKey === agent.agentKey;
          const avatarGradient =
            ROLE_AVATAR_CLASS[agent.role] || 'from-slate-500 to-slate-400';
          const statusClass = STATUS_DOT_CLASS[agent.status];
          const isWorking = agent.status === 'working';

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.agentKey)}
              className={cn(
                'absolute min-w-[152px] max-w-[190px] rounded-xl border border-border/70 bg-surface/70 p-3 text-left backdrop-blur-xl transition-all',
                'shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_8px_24px_oklch(0_0_0/0.25)]',
                selected ? 'ring-2 ring-brand' : 'hover:border-brand/40 hover:ring-1 hover:ring-brand/25'
              )}
              style={{ left: agent.x, top: agent.y }}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div
                    className={`h-11 w-11 rounded-full bg-gradient-to-br ${avatarGradient} text-white text-xs font-bold flex items-center justify-center shadow-lg`}
                  >
                    {initialsFromName(agent.name)}
                  </div>
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 inline-block h-3 w-3 rounded-full ring-2 ring-slate-950 ${statusClass} ${
                      isWorking ? 'animate-pulse' : ''
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <p className="truncate font-heading text-sm font-semibold text-foreground">{agent.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{agent.role}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">
                    {agent.ensName || `${agent.agentKey}.agent`}
                  </p>
                </div>
              </div>

              <p className="mt-2 truncate text-[10px] text-muted-foreground/90">
                {agent.description || 'Operational'}
              </p>
            </button>
          );
        })}
      </div>
    </GlassPanel>
  );
}
