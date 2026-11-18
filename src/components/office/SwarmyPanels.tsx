'use client';

/**
 * Paneles Swarmy S00 (solo presentación). Reciben los datos por props: no llaman a ninguna API,
 * así no dependen de la tabla/ruta de origen. Toda la lógica vive en src/lib (probada con node --test).
 *
 *   <HandoffChainPanel events={events} />       cadena soporte→handoff→ACK→diagnóstico→PR→aprobación→resultado
 *   <HarnessPanel agents={agents} />            4 harnesses: registrado / conectado / ejecutando / stale
 *   <AgentControlStatus events agentKey />      Solicitado ≠ Confirmado para pause/kill
 */

import { useEffect, useMemo, useState } from 'react';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { avrilTypography } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';
import { deriveHandoffChain, deriveRunControl } from '@/src/lib/handoffChain';
import type { EventItem } from '@/src/lib/handoffChain';
import { normalizeEvents } from '@/src/lib/eventAliases';
import { deriveHarnesses } from '@/src/lib/harnessStatus';
import type { AgentRow } from '@/src/lib/harnessStatus';
import { controlBadge, harnessBadge, originBadge, stepBadge } from '@/src/lib/statusBadge';
import type { Tone } from '@/src/lib/statusBadge';
import type { Origin } from '@/src/lib/handoffChain';

/** El backend nuevo (orchestratorEvents) agrega runId al evento. */
export type SwarmyEvent = EventItem & { runId?: string };

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-border/60 bg-surface/50 text-foreground/80',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  muted: 'border-border/60 bg-surface/40 text-muted-foreground',
};

function Pill({ label, tone, title }: { label: string; tone: Tone; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'rounded-full border px-1.5 py-0.5 text-[9px] font-heading uppercase tracking-wide',
        TONE_CLASS[tone]
      )}
    >
      {label}
    </span>
  );
}

/** Origen SIEMPRE visible: MOCK / REAL / SIN ORIGEN. */
export function OriginPill({ origin }: { origin: Origin }) {
  const b = originBadge(origin);
  return <Pill label={b.label} tone={b.tone} title={b.hint} />;
}

/** Reloj para timeouts/stale aunque no lleguen eventos nuevos. Arranca en 0 (sin desajuste de hidratación). */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function formatTime(iso?: string) {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
}

function isHttpUrl(s?: string) {
  return !!s && /^https?:\/\//i.test(s);
}

// ---------------------------------------------------------------- cadena de handoff

export function HandoffChainPanel({ events }: { events: SwarmyEvent[] }) {
  const { chain, runId, blockedSteps } = useMemo(() => {
    const normalized = normalizeEvents(events) as SwarmyEvent[];
    const view = deriveHandoffChain(normalized);

    let run: string | undefined;
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
      run = str(normalized[i].runId) ?? str(asRecord(normalized[i].payload).runId);
      if (run) break;
    }

    // Alejandro marca el bloqueo real con payload.status === 'BLOCKED': se muestra literal, no como "Fallido".
    const blocked = new Set<string>();
    for (const e of normalized) {
      const p = asRecord(e.payload);
      if (e.type === 'error.reported' && String(p.status ?? '').toUpperCase() === 'BLOCKED') {
        const step = str(p.step);
        if (step) blocked.add(step);
      }
    }
    return { chain: view, runId: run, blockedSteps: blocked };
  }, [events]);

  const hasAnyStep = chain.steps.some((s) => s.state !== 'pending');

  return (
    <GlassPanel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={cn(avrilTypography.card, 'text-sm')}>Cadena de handoff</h4>
        {chain.complete && !chain.hasMockData && <Pill label="Completa" tone="success" />}
        {chain.complete && chain.hasMockData && (
          <Pill label="Completa (MOCK)" tone="warning" title="Todos los pasos existen, pero hay datos simulados." />
        )}
      </div>

      <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
        <p>runId · {runId ?? '—'}</p>
        <p>handoffId · {chain.handoffId ?? '—'}</p>
      </div>

      {chain.hasMockData && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          Esta cadena incluye eventos MOCK. No es una ejecución real.
        </p>
      )}

      {!hasAnyStep && <p className="text-xs text-muted-foreground">Aún no hay eventos de handoff para este run.</p>}

      <ol className="space-y-1.5">
        {chain.steps.map((s, i) => {
          const isBlocked = s.state === 'failed' && blockedSteps.has(s.key);
          const badge = isBlocked
            ? { label: 'BLOCKED', tone: 'warning' as Tone }
            : stepBadge(s.state);
          const blockedMsg = isBlocked ? chain.errors.find((e) => e.step === s.key)?.message : undefined;
          return (
            <li key={s.key} className="rounded-xl border border-border/60 bg-background/40 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">
                  {i + 1}. {s.label}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <Pill label={badge.label} tone={badge.tone} />
                  {s.state !== 'pending' && <OriginPill origin={s.origin} />}
                </div>
              </div>
              {s.at && <p className="mt-0.5 text-[10px] text-muted-foreground">{formatTime(s.at)}</p>}
              {s.detail && <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{s.detail}</p>}
              {blockedMsg && <p className="mt-0.5 break-words text-[11px] text-amber-200">{blockedMsg}</p>}
              {s.evidenceRef &&
                (isHttpUrl(s.evidenceRef) ? (
                  <a
                    href={s.evidenceRef}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block break-all text-[11px] text-brand hover:underline"
                  >
                    {s.evidenceRef}
                  </a>
                ) : (
                  <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">ref · {s.evidenceRef}</p>
                ))}
            </li>
          );
        })}
      </ol>

      {chain.warnings.length > 0 && (
        <ul className="space-y-1">
          {chain.warnings.map((w) => (
            <li key={w} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
              {w}
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

// ---------------------------------------------------------------- harnesses

export function HarnessPanel({ agents }: { agents: AgentRow[] }) {
  const now = useNow();
  const { harnesses, unmatchedAgents } = useMemo(() => deriveHarnesses(agents, now), [agents, now]);
  const statusByKey = useMemo(() => new Map(agents.map((a) => [a.agentKey, a.status])), [agents]);

  return (
    <GlassPanel className="space-y-3 p-4">
      <h4 className={cn(avrilTypography.card, 'text-sm')}>Harnesses</h4>
      <ul className="space-y-1.5">
        {harnesses.map((h) => {
          const b = harnessBadge(h, h.agentKey ? statusByKey.get(h.agentKey) : undefined);
          return (
            <li key={h.key} className="rounded-xl border border-border/60 bg-background/40 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">{h.label}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <Pill label={b.label} tone={b.tone} title={b.hint} />
                  {h.registered && <OriginPill origin={h.origin} />}
                </div>
              </div>
              {b.hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{b.hint}</p>}
              {h.registered && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  conectado: {h.connected === null ? 'desconocido' : h.connected ? 'sí' : 'no'} · ejecutando:{' '}
                  {h.executing === null ? 'desconocido' : h.executing ? 'sí' : 'no'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {unmatchedAgents > 0 && (
        <p className="text-[10px] text-muted-foreground">{unmatchedAgents} agente(s) que no son de los 4 harnesses.</p>
      )}
    </GlassPanel>
  );
}

// ---------------------------------------------------------------- pause / stop

/** Estado verificable del último comando pause/kill de un agente. Solicitado ≠ Confirmado. */
export function AgentControlStatus({ events, agentKey }: { events: SwarmyEvent[]; agentKey: string | null }) {
  const now = useNow();
  const control = useMemo(() => {
    if (!agentKey) return null;
    const views = deriveRunControl(normalizeEvents(events), now);
    return views.find((c) => c.agentKey === agentKey) ?? null;
  }, [events, agentKey, now]);

  if (!agentKey) return null;
  if (!control) return <p className="text-[11px] text-muted-foreground">Sin comandos enviados a este agente.</p>;

  const b = controlBadge(control);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <Pill label={`${control.command === 'pause' ? 'Pausa' : 'Stop'}: ${b.label}`} tone={b.tone} />
        <OriginPill origin={control.origin} />
      </div>
      {b.hint && <p className="text-[10px] text-muted-foreground">{b.hint}</p>}
    </div>
  );
}
