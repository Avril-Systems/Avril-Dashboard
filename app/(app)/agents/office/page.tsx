'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

const DASHBOARD_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_APP_TOKEN ?? '';

type Session = {
  _id: string;
  chatId?: string;
  status: 'queued' | 'spawning' | 'active' | 'failed' | 'completed';
  spawnRequestId?: string;
  vpsRef?: string;
  containerRef?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

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

export default function AgentOfficePage() {
  const searchParams = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [showChat, setShowChat] = useState(false);

  const sessionId = searchParams.get('sessionId')?.trim() || '';
  const chatIdParam = searchParams.get('chatId')?.trim() || '';
  const resolvedChatId = session?.chatId || chatIdParam;

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (DASHBOARD_TOKEN) headers['x-dashboard-token'] = DASHBOARD_TOKEN;
    return headers;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

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
    <SectionBackdrop className="avril-marketing -mx-4 min-h-[calc(100vh-4rem)] px-4 pb-6 md:-mx-6 md:px-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
          <div className="space-y-3">
            <Eyebrow pulse>Operator console</Eyebrow>
            <div>
              <h2 className={cn(avrilTypography.display, 'text-3xl md:text-4xl')}>Agent Office</h2>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Session · {sessionId || '—'}
              </p>
            </div>
          </div>
          {session && (
            <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-heading text-brand">
              {session.status}
            </span>
          )}
        </div>

        <OfficeLegend />
        {statusMessage && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {statusMessage}
          </p>
        )}

        <GlassPanel className="p-4">
          <h4 className={cn(avrilTypography.card, 'mb-3 text-sm')}>Debug Panel (Temporary)</h4>
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

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
          <OfficeWorld2D
            agents={agents}
            selectedAgentKey={selectedAgentKey}
            onSelectAgent={setSelectedAgentKey}
          />

          <div className="space-y-4">
            <GlassPanel className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className={cn(avrilTypography.card, 'text-sm')}>Agent Controls</h4>
                {resolvedChatId && (
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
                    {showChat ? 'Hide Chat' : 'Chat'}
                  </button>
                )}
              </div>
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

            {showChat && resolvedChatId && (
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
            )}

            <SessionTimeline events={events} />
          </div>
        </div>
      </div>
    </SectionBackdrop>
  );
}
