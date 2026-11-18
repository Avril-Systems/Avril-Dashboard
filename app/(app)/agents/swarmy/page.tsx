'use client';

/**
 * Swarmy S00 — consola de runs (workspace -> run -> tareas/agentes).
 * Lee SOLO de /api/orchestration/swarmy/* (servidor -> Convex). No usa localStorage para datos:
 * el run abierto vive en la URL (?runId=) y todo el historial viene de Convex en cada recarga.
 *
 *   tareas  = pasos de la cadena de handoff + eventos del run
 *   agentes = harnesses (conexiones/heartbeats)
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eyebrow } from '@/components/patterns/eyebrow';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { avrilTypography } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';
import SessionTimeline from '@/src/components/office/SessionTimeline';
import { AgentControlStatus, HandoffChainPanel, HarnessPanel, OriginPill, Pill } from '@/src/components/office/SwarmyPanels';
import type { SwarmyEvent } from '@/src/components/office/SwarmyPanels';
import type { AgentRow } from '@/src/lib/harnessStatus';
import type { RunSummary } from '@/src/lib/swarmyRuns';

type ApiProblem = { code: string; message: string; missing?: string[] };

type PollState<T> = {
  data: T | null;
  problem: ApiProblem | null;
  lastOkAt: number | null;
  loading: boolean;
  refresh: () => void;
};

/** Consulta periódica. Conserva los últimos datos buenos si una consulta falla y expone el error. */
function usePolling<T>(url: string | null, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setData(null);
    setProblem(null);
    setLastOkAt(null);
    setLoading(Boolean(url));
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let active = true;
    async function load() {
      try {
        const res = await fetch(url as string, { cache: 'no-store', credentials: 'include' });
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok || body?.ok === false) {
          setProblem({
            code: body?.error?.code ?? `HTTP_${res.status}`,
            message: body?.error?.message ?? `Error HTTP ${res.status}`,
            missing: Array.isArray(body?.error?.missing) ? body.error.missing : undefined,
          });
        } else {
          setData(body as T);
          setProblem(null);
          setLastOkAt(Date.now());
        }
      } catch (err) {
        if (!active) return;
        setProblem({ code: 'NETWORK', message: err instanceof Error ? err.message : 'Sin conexión con el servidor' });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [url, intervalMs, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data, problem, lastOkAt, loading, refresh };
}

function formatDateTime(iso: string) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : '—';
}

function ProblemBanner({ problem, hasData }: { problem: ApiProblem; hasData: boolean }) {
  if (problem.code === 'CONFIG_MISSING') {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <p className="font-heading uppercase tracking-wide">BLOCKED · configuración del servidor incompleta</p>
        <p className="mt-1">
          Faltan variables de entorno: {problem.missing?.join(', ') ?? problem.message}. Mientras no existan no se puede leer Convex
          y esta vista no muestra datos (no se inventan).
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
      <p className="font-heading uppercase tracking-wide">Error · {problem.code}</p>
      <p className="mt-1 break-words">{problem.message}</p>
      {hasData && <p className="mt-1 text-rose-200/80">Se muestran los últimos datos recibidos; pueden estar desactualizados.</p>}
    </div>
  );
}

function RunOriginPills({ run }: { run: RunSummary }) {
  if (!run.hasMock && !run.hasReal) return <OriginPill origin="unknown" />;
  return (
    <>
      {run.hasMock && <OriginPill origin="mock" />}
      {run.hasReal && <OriginPill origin="real" />}
    </>
  );
}

function RunsList({ activeRunId, onSelect }: { activeRunId: string; onSelect: (runId: string) => void }) {
  const { data, problem, loading } = usePolling<{ runs: RunSummary[] }>('/api/orchestration/swarmy/runs', 5000);
  const runs = data?.runs ?? [];

  return (
    <GlassPanel className="flex min-h-0 flex-col gap-3 p-4">
      <div>
        <h4 className={cn(avrilTypography.card, 'text-sm')}>Runs</h4>
        <p className="text-[11px] text-muted-foreground">Workspace · eventos agrupados por runId</p>
      </div>
      {problem && <ProblemBanner problem={problem} hasData={runs.length > 0} />}
      {loading && !data && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {!loading && !problem && runs.length === 0 && <p className="text-xs text-muted-foreground">Aún no hay runs para este workspace.</p>}
      <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {runs.map((r) => {
          const selected = r.runId === activeRunId;
          return (
            <li key={r.runId}>
              <button
                type="button"
                onClick={() => onSelect(r.runId)}
                className={cn(
                  'w-full rounded-xl border px-2.5 py-2 text-left transition-colors',
                  selected ? 'border-brand/40 bg-brand/10' : 'border-transparent hover:border-border/60 hover:bg-background/40'
                )}
              >
                <p className="break-all font-mono text-[11px] text-foreground">{r.runId}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatDateTime(r.lastAt)} · {r.eventCount} eventos · {r.lastType}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <RunOriginPills run={r} />
                  {r.blocked && <Pill label="BLOCKED" tone="warning" title="Un paso quedó bloqueado (p. ej. falta el adaptador)." />}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}

type RunPayload = { runId: string; events: SwarmyEvent[]; agents: AgentRow[] };

function RunDetail({ runId }: { runId: string }) {
  const url = `/api/orchestration/swarmy/run?runId=${encodeURIComponent(runId)}`;
  const { data, problem, lastOkAt, loading, refresh } = usePolling<RunPayload>(url, 2000);
  const events = data?.events ?? [];
  const agents = data?.agents ?? [];

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const lastRun = useRef(runId);

  useEffect(() => {
    if (lastRun.current !== runId) {
      lastRun.current = runId;
      setSelectedAgent(null);
      setMessage(null);
    }
  }, [runId]);

  useEffect(() => {
    if (!selectedAgent && agents.length > 0) setSelectedAgent(agents[0].agentKey);
  }, [agents, selectedAgent]);

  const agentKeys = useMemo(() => agents.map((a) => a.agentKey), [agents]);

  async function send(command: 'pause' | 'kill') {
    if (!selectedAgent || busy) return;
    if (command === 'kill' && !window.confirm(`¿Solicitar STOP (kill) para "${selectedAgent}"? Esta acción es destructiva.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/orchestration/swarmy/control', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, agentKey: selectedAgent, command }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        setMessage({
          kind: 'error',
          text: body?.error?.message ?? `No se pudo solicitar ${command} (HTTP ${res.status}).`,
        });
        return;
      }
      setMessage({
        kind: 'info',
        text: `Solicitud de ${command} registrada para "${selectedAgent}" (${body?.status ?? 'ok'}). Aún NO está confirmada por el backend.`,
      });
      refresh();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : `No se pudo solicitar ${command}.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <GlassPanel className="space-y-2 p-4">
        <Eyebrow pulse>Run</Eyebrow>
        <h2 className={cn(avrilTypography.display, 'break-all text-lg md:text-xl')}>{runId}</h2>
        <p className="text-[11px] text-muted-foreground">
          {lastOkAt
            ? `Última lectura de Convex: ${new Date(lastOkAt).toLocaleTimeString()} · ${events.length} eventos`
            : loading
              ? 'Cargando desde Convex…'
              : 'Sin lecturas correctas todavía'}
        </p>
        {problem && <ProblemBanner problem={problem} hasData={Boolean(data)} />}
      </GlassPanel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <HandoffChainPanel events={events} fallbackRunId={runId} />
        <div className="flex min-w-0 flex-col gap-4">
          <HarnessPanel agents={agents} />

          <GlassPanel className="space-y-3 p-4">
            <h4 className={cn(avrilTypography.card, 'text-sm')}>Control de agentes</h4>
            {agentKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay agentes registrados para controlar.</p>
            ) : (
              <>
                <label className="block text-[11px] text-muted-foreground">
                  Agente
                  <select
                    value={selectedAgent ?? ''}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-background/60 px-2 py-1.5 text-xs text-foreground"
                  >
                    {agentKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !selectedAgent}
                    onClick={() => void send('pause')}
                    className="inline-flex h-10 min-w-[90px] items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 px-4 font-heading text-sm text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={busy || !selectedAgent}
                    onClick={() => void send('kill')}
                    className="inline-flex h-10 min-w-[90px] items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 px-4 font-heading text-sm text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Stop
                  </button>
                </div>
                <AgentControlStatus events={events} agentKey={selectedAgent} />
                {message && (
                  <p
                    className={cn(
                      'rounded-lg border px-2 py-1.5 text-[11px]',
                      message.kind === 'error'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                    )}
                  >
                    {message.text}
                  </p>
                )}
              </>
            )}
          </GlassPanel>
        </div>
      </div>

      <div className="h-[280px]">
        <SessionTimeline events={events} />
      </div>
    </div>
  );
}

function SwarmyConsole() {
  const router = useRouter();
  const runId = useSearchParams().get('runId')?.trim() || '';

  return (
    <div className="space-y-4 font-sans">
      <div>
        <Eyebrow>Swarmy · S00</Eyebrow>
        <h1 className={cn(avrilTypography.display, 'text-2xl')}>Runs y agentes</h1>
        <p className="text-xs text-muted-foreground">
          Datos leídos de Convex vía servidor. Los eventos MOCK se marcan siempre; un estado solo cambia cuando el backend lo confirma.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <RunsList activeRunId={runId} onSelect={(id) => router.push(`/agents/swarmy?runId=${encodeURIComponent(id)}`)} />
        {runId ? (
          <RunDetail runId={runId} />
        ) : (
          <GlassPanel className="p-6 text-sm text-muted-foreground">Selecciona un run de la lista para ver su cadena, agentes y controles.</GlassPanel>
        )}
      </div>
    </div>
  );
}

export default function SwarmyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Cargando…</div>}>
      <SwarmyConsole />
    </Suspense>
  );
}
