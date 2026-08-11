'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import OfficeWorld2D from '@/src/components/office/OfficeWorld2D';
import OfficeLegend from '@/src/components/office/OfficeLegend';
import SessionTimeline from '@/src/components/office/SessionTimeline';
import OfficeAgentChat from '@/src/components/office/OfficeAgentChat';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { SectionBackdrop } from '@/components/patterns/section-backdrop';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { avrilTypography } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';
import { readLastOfficeSessionId, rememberOfficeSessionId } from '@/src/lib/officeSessionMemory';
import { ORCHESTRATION_DEMO_SHARED_ORG } from '@/src/lib/orchestrationDemoScope';
import { AnimatePresence, motion } from 'framer-motion';

const DASHBOARD_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_APP_TOKEN ?? '';

type Session = {
  _id: string;
  chatId?: string;
  companyName?: string;
  chatTitle?: string;
  status: 'queued' | 'spawning' | 'active' | 'failed' | 'completed';
  spawnRequestId?: string;
  vpsRef?: string;
  containerRef?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type SessionSummary = Session & {
  chatTitle?: string;
  companyName?: string;
  agentCount?: number;
};

function companyLabel(session: { companyName?: string; chatTitle?: string } | null | undefined) {
  const raw = session?.companyName?.trim() || session?.chatTitle?.trim() || '';
  if (!raw) return 'Untitled company';
  // Client-side guard while older Convex rows still carry Venice template titles.
  if (/^#?\s*agent\s*brief\b/i.test(raw)) return 'Untitled company';
  return raw;
}

type Agent = {
  _id: string;
  agentKey: string;
  parentAgentKey?: string;
  name: string;
  role?: string;
  status: 'spawning' | 'idle' | 'working' | 'blocked' | 'completed' | 'error';
  x?: number;
  y?: number;
  meta?: unknown;
};

type EventItem = {
  _id: string;
  type: string;
  payload?: unknown;
  createdAt: string;
};

function DebugStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="text-[11px] font-heading uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

function statusTone(status: Session['status']) {
  switch (status) {
    case 'active':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'spawning':
    case 'queued':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    case 'failed':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    default:
      return 'border-border/60 bg-surface/50 text-muted-foreground';
  }
}

function useAuthHeaders() {
  return useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (DASHBOARD_TOKEN) headers['x-dashboard-token'] = DASHBOARD_TOKEN;
    return headers;
  }, []);
}

/** Prefer last-opened session, else newest company (API returns updatedAt desc). */
function pickDefaultSessionId(
  sessions: SessionSummary[],
  lastSessionId: string | null
): string | null {
  if (!sessions.length) return null;

  // DEMO: shared org — production should filter `sessions` by wallet user first.
  void ORCHESTRATION_DEMO_SHARED_ORG;

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  if (lastSessionId && sorted.some((s) => s._id === lastSessionId)) {
    return lastSessionId;
  }

  return sorted[0]?._id ?? null;
}

function useCompanySessions(authHeaders: Record<string, string>, reloadKey = '') {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/orchestration/sessions?limit=50', {
          cache: 'no-store',
          credentials: 'include',
          headers: authHeaders,
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(data?.error?.message || 'Failed to load companies');
          setSessions([]);
          return;
        }
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load companies');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [authHeaders, reloadKey]);

  return { sessions, loading, error };
}

function OfficeCompaniesSidebar({
  sessions,
  loading,
  error,
  activeSessionId,
  onSelect,
}: {
  sessions: SessionSummary[];
  loading: boolean;
  error: string;
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-border/50 bg-surface/30">
      <div className="shrink-0 space-y-1 border-b border-border/50 px-3 py-3">
        <p className="text-[11px] font-heading uppercase tracking-[0.12em] text-muted-foreground">
          Companies
        </p>
        <p className="text-xs text-muted-foreground">Switch office sessions</p>
        {ORCHESTRATION_DEMO_SHARED_ORG && (
          <p className="text-[10px] leading-snug text-muted-foreground/80">
            Demo: all companies in shared org. Production will scope by wallet.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <Link href="/start/idea" className="text-[11px] text-brand hover:underline">
          Build from my idea →
        </Link>
      </div>

      {error && (
        <p className="mx-3 mt-3 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-gutter:stable]">
        {loading && sessions.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : sessions.length === 0 ? (
          <div className="space-y-2 px-2 py-3 text-xs text-muted-foreground">
            <p>No office sessions yet.</p>
            <p className="text-[11px]">Create one via Form/Chat → Send to OpenClaw.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const selected = session._id === activeSessionId;
              return (
                <li key={session._id}>
                  <button
                    type="button"
                    onClick={() => onSelect(session._id)}
                    className={cn(
                      'w-full rounded-xl border px-2.5 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-brand/40 bg-brand/10'
                        : 'border-transparent bg-transparent hover:border-border/60 hover:bg-background/40'
                    )}
                  >
                    <p
                      className={cn(
                        'truncate text-sm font-heading',
                        selected ? 'text-foreground' : 'text-foreground/90'
                      )}
                    >
                      {companyLabel(session)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {new Date(session.updatedAt).toLocaleString()}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span
                        className={cn(
                          'rounded-full border px-1.5 py-0.5 text-[9px] font-heading uppercase tracking-wide',
                          statusTone(session.status)
                        )}
                      >
                        {session.status}
                      </span>
                      <span className="rounded-full border border-border/60 bg-surface/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                        {session.agentCount ?? 0} agents
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function OfficeEmptyState({
  loading,
  onResumeLast,
}: {
  loading?: boolean;
  onResumeLast?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <GlassPanel className="max-w-md space-y-4 p-6 text-center">
        <Eyebrow>Agent Office</Eyebrow>
        <div>
          <h2 className={cn(avrilTypography.display, 'text-2xl')}>
            {loading ? 'Opening your company…' : 'No companies yet'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {loading
              ? 'Restoring your latest Agent Office session.'
              : 'Create one via Build from my idea → Send to OpenClaw. It will open here automatically next time.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onResumeLast && (
            <MarketingBrandButton label="Resume last" onClick={onResumeLast} className="!min-w-0" />
          )}
          <MarketingBrandButton label="Build from my idea" href="/start/idea" className="!min-w-0" />
        </div>
      </GlassPanel>
    </div>
  );
}
// 🚧 TEMP MOCK DATA — SOLO PARA VER DISEÑO SIN CONVEX. BORRAR ANTES DE COMMIT/PUSH.
const DESIGN_PREVIEW_SESSION: Session = {
  _id: 'design-preview',
  chatId: 'design-preview-chat',
  companyName: 'Mycoseta (design preview)',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const DESIGN_PREVIEW_AGENTS: Agent[] = [
  { _id: 'a1', agentKey: 'ava', name: 'Ava — Ops Lead', role: 'Operations', status: 'working' },
  { _id: 'a2', agentKey: 'ben', name: 'Ben — Growth', role: 'Growth', status: 'idle', parentAgentKey: 'ava' },
  { _id: 'a3', agentKey: 'cleo', name: 'Cleo — Support', role: 'Support', status: 'blocked', parentAgentKey: 'ava' },
  { _id: 'a4', agentKey: 'drew', name: 'Drew — Finance', role: 'Finance', status: 'completed' },
  { _id: 'a5', agentKey: 'erin', name: 'Erin — Research', role: 'Market research & data gathering', status: 'working', parentAgentKey: 'drew' },
  { _id: 'a6', agentKey: 'finn', name: 'Finn — QA', role: 'Quality checks & compliance', status: 'idle', parentAgentKey: 'drew' },
  { _id: 'a7', agentKey: 'gia', name: 'Gia — Content', role: 'Content creation & comms', status: 'working' },
  { _id: 'a8', agentKey: 'hugo', name: 'Hugo — Partnerships', role: 'Distribution & partnerships', status: 'idle', parentAgentKey: 'gia' },
  { _id: 'a9', agentKey: 'iris', name: 'Iris — Metrics', role: 'Metrics, KPI tracking & reporting', status: 'error', parentAgentKey: 'gia' },
];
const DESIGN_PREVIEW_EVENTS: EventItem[] = [
  { _id: 'e1', type: 'agent.spawned', createdAt: new Date(Date.now() - 90_000).toISOString() },
  { _id: 'e2', type: 'gateway.connected', createdAt: new Date(Date.now() - 60_000).toISOString() },
  { _id: 'e3', type: 'agent.status.working', createdAt: new Date(Date.now() - 30_000).toISOString() },
];
// 🚧 FIN TEMP MOCK DATA
function OfficeSessionWorkspace({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const chatIdParam = useSearchParams().get('chatId')?.trim() || '';
  const resolvedChatId = session?.chatId || chatIdParam;
  const authHeaders = useAuthHeaders();

  useEffect(() => {
    rememberOfficeSessionId(sessionId);
    setSelectedAgentKey(null);
    setShowChat(false);
    setStatusMessage('');
    setShowDebug(false);
  }, [sessionId]);

useEffect(() => {
    let active = true;

    // 🚧 TEMP BYPASS — BORRAR ANTES DE COMMIT/PUSH.
    if (sessionId === 'design-preview') {
      setSession(DESIGN_PREVIEW_SESSION);
      setAgents(DESIGN_PREVIEW_AGENTS);
      setEvents(DESIGN_PREVIEW_EVENTS);
      setStatusMessage('');
      return () => {
        active = false;
      };
    }
    // 🚧 FIN TEMP BYPASS

    async function loadState() {
      try {
        const res = await fetch(`/api/orchestration/session?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: authHeaders,
        });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setStatusMessage(data?.error?.message || 'Failed to load office state');
          return;
        }
        setSession(data.session ?? null);
        setAgents(Array.isArray(data.agents) ? data.agents : []);
        setEvents(Array.isArray(data.events) ? data.events : []);
        setStatusMessage('');
      } catch (err) {
        if (!active) return;
        setStatusMessage(err instanceof Error ? err.message : 'Failed to load office state');
      }
    }

    void loadState();
    const id = setInterval(loadState, 1200);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sessionId, authHeaders]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agentKey === selectedAgentKey) ?? null,
    [agents, selectedAgentKey]
  );
  const lastEvent = events[events.length - 1] ?? null;
  const wsStatus = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const t = events[i]?.type;
      if (t === 'gateway.connected') return 'connected';
      if (t === 'gateway.connecting') return 'connecting';
      if (t === 'gateway.disconnected') return 'disconnected';
    }
    return 'connecting';
  }, [events]);

  async function sendAgentCommand(command: 'pause' | 'kill') {
    if (!sessionId || !selectedAgent) return;
    const res = await fetch('/api/orchestration/control', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ sessionId, agentKey: selectedAgent.agentKey, command }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatusMessage(data?.error?.message || `Failed to ${command} agent`);
      return;
    }
    setStatusMessage(`${command} command sent to ${selectedAgent.name}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Compact sticky header */}
      <header className="shrink-0 space-y-3 border-b border-border/50 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Eyebrow pulse>Operator console</Eyebrow>
            <h2 className={cn(avrilTypography.display, 'truncate text-xl md:text-2xl')}>
              {session ? companyLabel(session) : 'Agent Office'}
            </h2>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              Session · {sessionId || '—'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {session && (
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-heading uppercase tracking-wide',
                  statusTone(session.status)
                )}
              >
                {session.status}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowDebug((v) => !v)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-heading transition-colors',
                showDebug
                  ? 'border-brand/40 bg-brand/15 text-brand'
                  : 'border-border/70 bg-surface/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {showDebug ? 'Hide debug' : 'Debug'}
            </button>
          </div>
        </div>

        <OfficeLegend />

        {statusMessage && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {statusMessage}
          </p>
        )}

        {showDebug && (
          <GlassPanel className="p-3">
            <h4 className={cn(avrilTypography.card, 'mb-2 text-sm')}>Debug Panel (Temporary)</h4>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <DebugStat label="WebSocket Status">
                <span className="capitalize text-brand">{wsStatus}</span>
              </DebugStat>
              <DebugStat label="Last Event">
                <p>{lastEvent ? lastEvent.type : '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {lastEvent ? new Date(lastEvent.createdAt).toLocaleTimeString() : '—'}
                </p>
              </DebugStat>
              <DebugStat label="Raw Agent Count (Convex)">{agents.length}</DebugStat>
            </div>
          </GlassPanel>
        )}
      </header>

      {/* Scrollable workspace */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        <div className="grid grid-cols-1 gap-4 p-4 md:p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <OfficeWorld2D
              agents={agents}
              selectedAgentKey={selectedAgentKey}
              onSelectAgent={setSelectedAgentKey}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <GlassPanel className="shrink-0 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className={cn(avrilTypography.card, 'text-sm')}>Agent Controls</h4>
                <button
                  type="button"
                  onClick={() => setShowChat((v) => !v)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-heading transition-colors',
                    showChat
                      ? 'border-brand/40 bg-brand/15 text-brand'
                      : 'border-border/70 bg-surface/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {showChat ? 'Hide Timeline' : 'Timeline'}
                </button>
              </div>

             <AnimatePresence initial={false}>
                {showChat && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 220, opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="h-[220px] pb-3">
                      <SessionTimeline events={events} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!selectedAgent && (
                <p className="text-xs text-muted-foreground">
                  Select an agent in the map to inspect and control it.
                </p>
              )}
              {selectedAgent && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-heading font-semibold text-foreground">{selectedAgent.name}</p>
                    <p className="text-xs text-muted-foreground">Role · {selectedAgent.role || '—'}</p>
                    <p className="text-xs text-muted-foreground">Status · {selectedAgent.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MarketingBrandButton
                      label="Pause"
                      onClick={() => void sendAgentCommand('pause')}
                      className="!min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => void sendAgentCommand('kill')}
                      className="inline-flex h-[46px] min-w-[100px] items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 px-5 font-heading text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                    >
                      Kill
                    </button>
                  </div>
                </div>
              )}
            </GlassPanel>

           {resolvedChatId && (
              <div className="shrink-0">
                <OfficeAgentChat
                  agents={agents.map((a) => ({
                    agentKey: a.agentKey,
                    name: a.name,
                    role: a.role,
                    status: a.status,
                  }))}
                  chatId={resolvedChatId}
                  selectedAgentKey={selectedAgentKey}
                  onSelectAgent={setSelectedAgentKey}
                />
              </div>
            )}

            
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentOfficePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId =
    searchParams.get('sessionId')?.trim() ||
    (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_CONVEX_URL ? 'design-preview' : ''); // 🚧 TEMP — BORRAR
  const authHeaders = useAuthHeaders();
  const { sessions, loading, error } = useCompanySessions(authHeaders, sessionId);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [autoOpenAttempted, setAutoOpenAttempted] = useState(false);

  useEffect(() => {
    setLastSessionId(readLastOfficeSessionId());
  }, [sessionId]);

  // Default: open last / best company in the agents workspace (no empty picker).
  useEffect(() => {
    if (sessionId || loading || autoOpenAttempted) return;
    setAutoOpenAttempted(true);
    const defaultId = pickDefaultSessionId(sessions, readLastOfficeSessionId());
    if (!defaultId) return;
    rememberOfficeSessionId(defaultId);
    router.replace(`/agents/office?sessionId=${encodeURIComponent(defaultId)}`);
  }, [sessionId, loading, sessions, autoOpenAttempted, router]);

  function openSession(nextId: string) {
    rememberOfficeSessionId(nextId);
    setSidebarOpenMobile(false);
    router.push(`/agents/office?sessionId=${encodeURIComponent(nextId)}`);
  }

  const showLoadingEmpty = !sessionId && (loading || (!autoOpenAttempted && sessions.length > 0));

  return (
    <SectionBackdrop className="avril-marketing flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden md:h-[calc(100dvh-6.5rem)]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background/30 xl:flex-row">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2 xl:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpenMobile((v) => !v)}
            className="rounded-full border border-border/70 bg-surface/60 px-3 py-1 text-xs font-heading text-muted-foreground transition-colors hover:text-foreground"
          >
            {sidebarOpenMobile ? 'Hide companies' : 'Companies'}
          </button>
          {sessionId ? (
            <p className="truncate font-mono text-[10px] text-muted-foreground">{sessionId.slice(0, 16)}…</p>
          ) : (
            <p className="text-xs text-muted-foreground">Opening company…</p>
          )}
        </div>

        <div
          className={cn(
            'min-h-0 xl:flex xl:h-full xl:w-[260px] xl:shrink-0',
            sidebarOpenMobile ? 'flex max-h-[36vh] shrink-0 xl:max-h-none xl:h-full' : 'hidden xl:flex'
          )}
        >
          <OfficeCompaniesSidebar
            sessions={sessions}
            loading={loading}
            error={error}
            activeSessionId={sessionId}
            onSelect={openSession}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {sessionId ? (
            <OfficeSessionWorkspace sessionId={sessionId} />
          ) : (
            <OfficeEmptyState
              loading={showLoadingEmpty}
              onResumeLast={
                lastSessionId
                  ? () => {
                      openSession(lastSessionId);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </SectionBackdrop>
  );
}

export default function AgentOfficePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading office…</div>}>
      <AgentOfficePageContent />
    </Suspense>
  );
}
