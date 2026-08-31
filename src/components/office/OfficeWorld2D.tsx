'use client';

import { useMemo } from 'react';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Headphones,
  DollarSign,
  Search,
  ShieldCheck,
  PenTool,
  Handshake,
  BarChart3,
  Settings,
  Bot,
} from 'lucide-react';
// 🎨 Mapea agentKey → imagen del personaje. Agrega más conforme tengas los archivos.
const AGENT_AVATAR_IMAGES: Record<string, string> = {
  ava: '/agents/ava-alien.png',
};
const DEFAULT_AGENT_IMAGE = '/agents/ava-alien.png'; // fallback: usa la mascota para cualquier agente sin imagen propia
const ROOM_RADIUS_CLASSES = ['rounded-xl', 'rounded-2xl', 'rounded-3xl'];
const GLOW_PALETTE = [
  '0,153,175',   // teal (marca)
  '168,85,247',  // violeta
  '245,158,11',  // ámbar
  '244,63,94',   // rosa
  '16,185,129',  // esmeralda
  '59,130,246',  // azul
  '217,70,239',  // fucsia
  '249,115,22',  // naranja
  '34,211,238',  // cian
];
function hashString(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}
function glowColorForKey(key: string): string {
  return GLOW_PALETTE[hashString(key) % GLOW_PALETTE.length];
}
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
    x: 180,
    y: 120,
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
    x: 460,
    y: 120,
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
    x: 320,
    y: 250,
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
    x: 90,
    y: 250,
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
    x: 550,
    y: 250,
    ensName: 'cirq.avril.eth',
    description: 'Retrying connection',
    isMock: true,
  },
];

const WORLD_WIDTH = 680;
const WORLD_HEIGHT = 620;

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  idle: 'bg-emerald-400',
  working: 'bg-amber-400',
  error: 'bg-rose-400',
  spawning: 'bg-blue-400',
  completed: 'bg-teal-400',
  blocked: 'bg-amber-500',
};
const ROLE_ICON_MAP: Record<string, typeof Bot> = {
  Operations: Settings,
  Growth: TrendingUp,
  Support: Headphones,
  Finance: DollarSign,
  'Market research & data gathering': Search,
  'Quality checks & compliance': ShieldCheck,
  'Content creation & comms': PenTool,
  'Distribution & partnerships': Handshake,
  'Metrics, KPI tracking & reporting': BarChart3,
};

function iconForRole(role: string) {
  return ROLE_ICON_MAP[role] ?? Bot;
}
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
  // Grid en vez de anillos: se reparte solo sin importar cuántos agentes haya.
  const cols = Math.max(1, Math.ceil(Math.sqrt(agents.length)));
  const rows = Math.max(1, Math.ceil(agents.length / cols));
  const marginX = 70;
  const marginY = 95;
  const cellW = (WORLD_WIDTH - marginX * 2) / cols;
  const cellH = (WORLD_HEIGHT - marginY * 2) / rows;

  return agents.map((agent, i) => {
    const hasCoords = typeof agent.x === 'number' && typeof agent.y === 'number';
const col = i % cols;
    const row = Math.floor(i / cols);
    // Jitter consistente (basado en el nombre del agente, no random puro) para
    // que se vea acomodado a mano en vez de en cuadrícula perfecta.
    const seed = hashString(agent.agentKey);
    const jitterX = ((seed % 100) / 100 - 0.5) * cellW * 0.5;
    const jitterY = (((seed >>> 8) % 100) / 100 - 0.5) * cellH * 0.5;
    const brickOffset = row % 2 === 1 ? cellW * 0.18 : 0; // filas pares/impares desfasadas
    const cx = marginX + col * cellW + cellW / 2 + jitterX + brickOffset;
    const cy = marginY + row * cellH + cellH / 2 + jitterY;

    return {
      id: agent._id,
      agentKey: agent.agentKey,
      parentAgentKey: agent.parentAgentKey,
      name: agent.name,
      role: agent.role || 'Agent',
      status: agent.status,
      x: hasCoords ? (agent.x as number) : Math.round(cx),
      y: hasCoords ? (agent.y as number) : Math.round(cy),
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

    const hierarchyLinks = worldAgents
      .filter((a) => a.parentAgentKey)
      .map((a) => ({ parent: a.parentAgentKey as string, child: a.agentKey }));

    if (hierarchyLinks.length > 0) return hierarchyLinks;

    // Sin jerarquía real entre agentes: conecta los cuartos en cadena,
    // en el orden del grid, para simular pasillos entre oficinas.
    const chain: { parent: string; child: string }[] = [];
    for (let i = 0; i < worldAgents.length - 1; i += 1) {
      chain.push({ parent: worldAgents[i].agentKey, child: worldAgents[i + 1].agentKey });
    }
    return chain;
  }, [worldAgents, hasRealAgents]);

  return (
    <GlassPanel className="p-2 sm:p-3">
     <div className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-[var(--avril-canvas)]">
        <p className="absolute left-3 top-2 z-10 font-heading text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          Agent Floorplan
        </p>
        <div className="relative mx-auto h-[280px] w-full sm:h-[340px] md:h-[420px] xl:h-[520px]">
          <div
            className="absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.48] sm:scale-[0.56] md:scale-[0.68] xl:scale-[0.82]"
            style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_0%,oklch(0.62_0.14_210/0.10),transparent_55%),radial-gradient(800px_500px_at_100%_100%,oklch(0.62_0.14_210/0.06),transparent_50%)]" />
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(to right, var(--avril-grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--avril-grid-line) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
{worldAgents.map((agent) => {
              const seed = hashString(agent.agentKey);
              const glow = glowColorForKey(agent.agentKey);
              const roomW = 110 + (seed % 50); // 110–160px
              const roomH = 100 + ((seed >>> 4) % 45); // 100–145px
              const roomRot = -6 + ((seed >>> 8) % 13); // -6° a +6°
              const RoleIcon = iconForRole(agent.role);

              return (
                <div
                  key={`room-${agent.id}`}
                  className="pointer-events-none absolute"
                  style={{ left: agent.x, top: agent.y }}
                >
                  {/* Cuarto hexagonal */}
                  <div
                    className="absolute border"
                    style={{
                      width: roomW,
                      height: roomH,
                      transform: `translate(-50%, -42%) rotate(${roomRot}deg)`,
                      clipPath: 'polygon(22% 0%, 78% 0%, 100% 50%, 78% 100%, 22% 100%, 0% 50%)',
                      background: `rgba(${glow},0.06)`,
                      borderColor: `rgba(${glow},0.35)`,
                    }}
                  />
                  {/* Ícono de rol, sin rotar */}
                  <div
                    className="absolute flex items-center justify-center rounded-full border"
                    style={{
                      width: 22,
                      height: 22,
                      transform: `translate(-50%, ${-roomH * 0.62}px)`,
                      background: `rgba(${glow},0.18)`,
                      borderColor: `rgba(${glow},0.4)`,
                    }}
                  >
                    <RoleIcon className="h-3 w-3" style={{ color: `rgb(${glow})` }} />
                  </div>
                </div>
              );
            })}

            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {links.map((link) => {
                const parent = byKey.get(link.parent);
                const child = byKey.get(link.child);
                if (!parent || !child) return null;
                const glow = glowColorForKey(child.agentKey);
                const midX = (parent.x + child.x) / 2;
                const midY = (parent.y + child.y) / 2;

                return (
                  <g key={`${link.parent}->${link.child}`}>
                    <line
                      x1={parent.x}
                      y1={parent.y}
                      x2={child.x}
                      y2={child.y}
                      stroke={`rgba(${glow}, 0.4)`}
                      strokeWidth="1.5"
                      strokeDasharray="4 5"
                    />
                    <circle cx={midX} cy={midY} r={3} fill={`rgba(${glow}, 0.9)`} />
                  </g>
                );
              })}
            </svg>

            {worldAgents.map((agent) => {
              const selected = selectedAgentKey === agent.agentKey;
              const avatarGradient =
                ROLE_AVATAR_CLASS[agent.role] || 'from-slate-500 to-slate-400';
              const statusClass = STATUS_DOT_CLASS[agent.status];
              const isWorking = agent.status === 'working';

              const isOrchestrator = !agent.parentAgentKey;

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onSelectAgent(agent.agentKey)}
                  title={`${agent.name} — ${agent.role}`}
                  className={cn(
                    'absolute flex flex-col items-center gap-1.5 transition-transform',
                    selected ? 'z-10 scale-105' : 'hover:scale-105'
                  )}
                  style={{ left: agent.x, top: agent.y }}
                >
                <div className="relative shrink-0">
                  {(() => {
                    const imgSrc = AGENT_AVATAR_IMAGES[agent.agentKey] ?? DEFAULT_AGENT_IMAGE;
                    const glow = glowColorForKey(agent.agentKey);
                    const tiltSeed = hashString(agent.agentKey);
                    const tiltY = -14 + (tiltSeed % 28); // entre -14deg y +14deg, distinto por agente
                    return (
                      <div
                        className={cn(
                          'relative flex items-center justify-center',
                          isOrchestrator ? 'h-28 w-28' : 'h-20 w-20'
                        )}
                        style={{ perspective: '400px' }}
                      >
                        {/* "Portal" de luz en los pies, como si saliera del hexágono */}
                        <div
                          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full blur-md"
                          style={{
                            width: '85%',
                            height: '30%',
                            background: `radial-gradient(ellipse, rgba(${glow},0.85) 0%, rgba(${glow},0.3) 60%, transparent 80%)`,
                          }}
                        />
                        <div
                          className="pointer-events-none absolute inset-[-30%] rounded-full opacity-70 blur-xl"
                          style={{
                            background: `radial-gradient(circle, rgba(${glow},0.55) 0%, rgba(${glow},0.15) 55%, transparent 75%)`,
                          }}
                        />
                        <motion.img
                          src={imgSrc}
                          alt={agent.name}
                          className={cn(
                            'relative object-contain',
                            isOrchestrator ? 'h-24 w-24' : 'h-18 w-18'
                          )}
                          style={{
                            transform: `rotateX(8deg) rotateY(${tiltY}deg)`,
                            filter: `drop-shadow(0 10px 12px rgba(0,0,0,0.5)) drop-shadow(0 0 10px rgba(${glow},0.35))`,
                          }}
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      </div>
                    );
                  })()}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-slate-950 ${statusClass} ${
                        isWorking ? 'animate-pulse' : ''
                      }`}
                    />
                  </div>

                  <span
                    className={cn(
                      'whitespace-nowrap rounded-full border px-2.5 py-1 font-heading font-semibold text-white shadow-md backdrop-blur-sm',
                      isOrchestrator
                        ? 'border-brand/50 bg-brand/25 text-[10px]'
                        : 'border-border/70 bg-black/80 text-[9px]'
                    )}
                  >
                    {agent.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
