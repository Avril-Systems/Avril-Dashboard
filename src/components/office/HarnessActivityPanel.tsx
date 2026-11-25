'use client';

/**
 * Actividades de los 4 arneses (solo presentación + el POST de asignación).
 *
 *   <ActivityAssignPanel onAssigned={(runId) => ...} />
 *   <ActivityResultsPanel activities={...} />   resultados reales persistidos en Convex
 *
 * La UI no simula ejecución: muestra lo que devolvió el worker y, si no hay
 * worker, deja la actividad en cola con el estado real.
 */

import { useMemo, useState } from 'react';
import { GlassPanel } from '@/components/patterns/glass-panel';
import { avrilTypography } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';
import { HARNESS_CATALOG, HARNESS_TYPES, isHarnessType } from '@/convex/lib/harnessActivities';
import type { HarnessType } from '@/convex/lib/harnessActivities';
import { toUiBadge } from '@/src/lib/statusBadge';
import { OriginPill, Pill } from '@/src/components/office/SwarmyPanels';
import type { Tone } from '@/src/lib/statusBadge';

export type HarnessActivityItem = {
  activityId: string;
  runId: string;
  harnessType: string;
  activity: string;
  title: string;
  input?: unknown;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  summary?: unknown;
  result?: unknown;
  error?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
};

const DASHBOARD_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_APP_TOKEN ?? '';

function authHeaders(): Record<string, string> {
  return DASHBOARD_TOKEN ? { 'x-dashboard-token': DASHBOARD_TOKEN } : {};
}

const SUMMARY_LABELS: Record<string, string> = {
  queries: 'Búsquedas',
  discovered: 'Descubiertos',
  rejected: 'Rechazados',
  verified: 'Verificados',
  top5: 'Top 5',
  rateRatio: 'Conversión %',
  usedToken: 'Con GITHUB_TOKEN',
  githubRequests: 'Llamadas a GitHub',
  rateLimitRemaining: 'Rate limit restante',
  targets: 'Objetivos',
  reachable: 'Accesibles',
  unreachable: 'No accesibles',
  qualified: 'Calificadas',
  averageScore: 'Score promedio',
  url: 'URL',
  finalUrl: 'URL final',
  httpStatus: 'HTTP',
  title: 'Título',
  wordCount: 'Palabras',
  h1: 'H1',
  h2: 'H2',
  cta: 'CTAs',
  findings: 'Hallazgos',
  score: 'Score',
  fetchedAt: 'Consultado',
  windowHours: 'Ventana (h)',
  severity: 'Severidad',
  errorEvents: 'Errores',
  failedActivities: 'Actividades fallidas',
  blockedActivities: 'Bloqueadas',
  groups: 'Grupos',
  latestAt: 'Último',
  scannedEvents: 'Eventos leídos',
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : iso;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function defaultsFor(harness: HarnessType): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of HARNESS_CATALOG[harness].activity.inputFields) {
    values[field.key] = field.defaultValue !== undefined ? String(field.defaultValue) : '';
  }
  return values;
}

export function ActivityAssignPanel({ onAssigned }: { onAssigned?: (runId: string, activityId: string) => void }) {
  const [harness, setHarness] = useState<HarnessType>('prospecting');
  const [values, setValues] = useState<Record<string, string>>(() => defaultsFor('prospecting'));
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ runId: string; activityId: string } | null>(null);

  const def = HARNESS_CATALOG[harness].activity;

  function selectHarness(next: HarnessType) {
    setHarness(next);
    setValues(defaultsFor(next));
    setTitle('');
    setError('');
    setCreated(null);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    setCreated(null);
    try {
      const res = await fetch('/api/orchestration/harness/activities', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          harnessType: harness,
          activity: def.key,
          title: title.trim() || undefined,
          input: values,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        setError(body?.error?.message ?? `No se pudo asignar (HTTP ${res.status}).`);
        return;
      }
      setCreated({ runId: body.runId, activityId: body.activityId });
      onAssigned?.(body.runId, body.activityId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar la actividad.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className={cn(avrilTypography.card, 'text-sm')}>Asignar actividad</h3>
          <p className="text-[11px] text-muted-foreground">
            El Dashboard encola en Convex. El worker ejecuta de verdad y guarda el resultado; si no está corriendo, la
            actividad queda en cola (no se simula).
          </p>
        </div>
        <Pill label="REAL" tone="success" title="La actividad solo se marca completada cuando un worker real la ejecuta." />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {HARNESS_TYPES.map((key) => {
          const item = HARNESS_CATALOG[key];
          const active = key === harness;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectHarness(key)}
              className={cn(
                'rounded-xl border p-2.5 text-left transition-colors',
                active ? 'border-brand/50 bg-brand/10' : 'border-border/60 bg-background/30 hover:border-border'
              )}
            >
              <p className="font-heading text-xs text-foreground">{item.label}</p>
              <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{item.description}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border/60 bg-background/30 p-3">
        <p className="text-xs font-medium text-foreground">{def.label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{def.description}</p>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {def.inputFields.map((field) => (
            <label key={field.key} className={cn('block text-[11px] text-muted-foreground', field.type === 'textarea' && 'md:col-span-2')}>
              <span className="font-heading uppercase tracking-wide">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.type === 'textarea' ? (
                <textarea
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background/60 px-2 py-1.5 font-mono text-[11px] text-foreground"
                />
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  min={field.min}
                  max={field.max}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background/60 px-2 py-1.5 text-xs text-foreground"
                />
              )}
              {field.help && <span className="mt-1 block text-[10px] text-muted-foreground/80">{field.help}</span>}
            </label>
          ))}
          <label className="block text-[11px] text-muted-foreground md:col-span-2">
            <span className="font-heading uppercase tracking-wide">Título (opcional)</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={def.defaultTitle}
              className="mt-1 w-full rounded-lg border border-border/60 bg-background/60 px-2 py-1.5 text-xs text-foreground"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center rounded-full border border-brand/40 bg-brand/15 px-4 font-heading text-xs text-foreground transition-colors hover:bg-brand/25 disabled:opacity-50"
          >
            {busy ? 'Asignando…' : 'Asignar actividad'}
          </button>
          <span className="text-[10px] text-muted-foreground">
            Se crea un run nuevo y la actividad queda <span className="font-mono">queued</span> hasta que el worker la reclame.
          </span>
        </div>

        {error && (
          <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">{error}</p>
        )}
        {created && (
          <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-300">
            En cola · activityId <span className="font-mono">{created.activityId}</span> · runId{' '}
            <span className="font-mono">{created.runId}</span>
          </p>
        )}
      </div>
    </GlassPanel>
  );
}

function SummaryGrid({ summary }: { summary: unknown }) {
  const record = asRecord(summary);
  const entries = Object.entries(record);
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-border/50 bg-background/30 px-2 py-1.5">
          <dt className="text-[9px] font-heading uppercase tracking-wide text-muted-foreground">{SUMMARY_LABELS[key] ?? key}</dt>
          <dd className="break-words text-[11px] text-foreground">{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProspectingItems({ items }: { items: unknown[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((raw, index) => {
        const item = asRecord(raw);
        const handle = typeof item.handle === 'string' ? item.handle : `#${index + 1}`;
        const profile = typeof item.url_perfil === 'string' ? item.url_perfil : undefined;
        const evidence = typeof item.url_exacta_evidencia === 'string' ? item.url_exacta_evidencia : undefined;
        return (
          <li key={`${handle}-${index}`} className="rounded-xl border border-border/60 bg-background/40 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] text-foreground">@{handle}</p>
              <div className="flex flex-wrap gap-1">
                {typeof item.prioridad === 'number' && item.prioridad <= 5 && (
                  <Pill label={`Top ${item.prioridad}`} tone="success" />
                )}
                {typeof item.tipo_comprador === 'string' && <Pill label={String(item.tipo_comprador)} tone="info" />}
                {typeof item.nivel_confianza === 'string' && <Pill label={`Confianza ${item.nivel_confianza}`} tone="neutral" />}
              </div>
            </div>
            {typeof item.cita_textual_fuente === 'string' && (
              <p className="mt-1 break-words text-[11px] italic text-muted-foreground">{item.cita_textual_fuente}</p>
            )}
            {typeof item.oferta_sugerida === 'string' && (
              <p className="mt-1 text-[11px] text-foreground/90">Oferta: {item.oferta_sugerida}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
              {profile && (
                <a href={profile} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  Perfil
                </a>
              )}
              {evidence && (
                <a href={evidence} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  Evidencia
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function B2BItems({ items }: { items: unknown[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((raw, index) => {
        const item = asRecord(raw);
        const url = typeof item.finalUrl === 'string' ? item.finalUrl : typeof item.url === 'string' ? item.url : undefined;
        const tech = Array.isArray(item.tech) ? item.tech : [];
        const reasons = Array.isArray(item.reasons) ? item.reasons : [];
        return (
          <li key={`${url ?? index}`} className="rounded-xl border border-border/60 bg-background/40 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-words text-[11px] text-foreground">{String(item.name ?? url ?? `#${index + 1}`)}</p>
              <div className="flex flex-wrap gap-1">
                {item.reachable === false ? (
                  <Pill label="No accesible" tone="danger" />
                ) : (
                  <Pill label={`HTTP ${String(item.httpStatus ?? '?')}`} tone="success" />
                )}
                {typeof item.score === 'number' && <Pill label={`Score ${item.score}/10`} tone={item.score >= 6 ? 'success' : 'neutral'} />}
                {typeof item.fit === 'string' && <Pill label={`Fit ${item.fit}`} tone="info" />}
              </div>
            </div>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[10px] text-brand hover:underline">
                {url}
              </a>
            )}
            {typeof item.error === 'string' && <p className="mt-1 text-[11px] text-rose-300">{item.error}</p>}
            {tech.length > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">Stack: {tech.map((t) => String(t)).join(' · ')}</p>
            )}
            {reasons.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">{reasons.map((r) => String(r)).join(' · ')}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function MarketingFindings({ items }: { items: unknown[] }) {
  const toneFor = (severity: unknown): Tone =>
    severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'neutral';
  return (
    <ul className="space-y-1.5">
      {items.map((raw, index) => {
        const item = asRecord(raw);
        return (
          <li key={index} className="rounded-xl border border-border/60 bg-background/40 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-foreground">{String(item.message ?? 'Hallazgo')}</p>
              <Pill label={String(item.severity ?? 'info')} tone={toneFor(item.severity)} />
            </div>
            {typeof item.area === 'string' && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.area}</p>}
            {typeof item.recommendation === 'string' && (
              <p className="mt-1 text-[10px] text-foreground/80">→ {item.recommendation}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SupportGroups({ items }: { items: unknown[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((raw, index) => {
        const item = asRecord(raw);
        const examples = Array.isArray(item.examples) ? item.examples : [];
        return (
          <li key={index} className="rounded-xl border border-border/60 bg-background/40 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-words font-mono text-[11px] text-foreground">{String(item.key ?? `Grupo ${index + 1}`)}</p>
              <Pill label={`${String(item.count ?? 0)} incidente(s)`} tone="warning" />
            </div>
            {examples.map((rawExample, i) => {
              const example = asRecord(rawExample);
              return (
                <p key={i} className="mt-1 break-words text-[10px] text-muted-foreground">
                  {formatDateTime(typeof example.at === 'string' ? example.at : undefined)} · {String(example.message ?? '—')}
                  {typeof example.runId === 'string' && <span className="font-mono"> · {example.runId}</span>}
                </p>
              );
            })}
          </li>
        );
      })}
    </ul>
  );
}

function ActivityResultBody({ activity }: { activity: HarnessActivityItem }) {
  const result = asRecord(activity.result);
  const items = Array.isArray(result.items) ? result.items : [];
  const rejections = Array.isArray(result.rejections) ? result.rejections : [];
  const summary = activity.summary ?? result.summary;

  return (
    <div className="space-y-2">
      <SummaryGrid summary={summary} />
      {items.length > 0 &&
        (activity.harnessType === 'prospecting' ? (
          <ProspectingItems items={items} />
        ) : activity.harnessType === 'b2b' ? (
          <B2BItems items={items} />
        ) : activity.harnessType === 'marketing' ? (
          <MarketingFindings items={items} />
        ) : (
          <SupportGroups items={items} />
        ))}
      {typeof result.note === 'string' && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">{result.note}</p>
      )}
      {rejections.length > 0 && (
        <details className="rounded-lg border border-border/60 bg-background/30 px-2 py-1.5">
          <summary className="cursor-pointer text-[10px] text-muted-foreground">
            Rechazos del gate ({rejections.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {rejections.map((raw, index) => {
              const rejection = asRecord(raw);
              return (
                <li key={index} className="text-[10px] text-muted-foreground">
                  <span className="font-mono">@{String(rejection.handle ?? '?')}</span> · {String(rejection.motivo ?? '—')}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {Object.keys(result).length > 0 && (
        <details className="rounded-lg border border-border/60 bg-background/30 px-2 py-1.5">
          <summary className="cursor-pointer text-[10px] text-muted-foreground">Ver JSON completo</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] text-foreground/80">
            {JSON.stringify(result, null, 2).slice(0, 20_000)}
          </pre>
        </details>
      )}
    </div>
  );
}

export function ActivityResultsPanel({ activities }: { activities: HarnessActivityItem[] }) {
  const ordered = useMemo(
    () => [...activities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)),
    [activities]
  );

  return (
    <GlassPanel className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={cn(avrilTypography.card, 'text-sm')}>Actividades del run</h4>
        <span className="text-[10px] text-muted-foreground">{ordered.length} asignada(s)</span>
      </div>

      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Este run no tiene actividades asignadas. Usa “Asignar actividad” para encolar una.
        </p>
      ) : (
        <ul className="space-y-2">
          {ordered.map((activity) => {
            const badge = toUiBadge(activity.status);
            const catalog = isHarnessType(activity.harnessType) ? HARNESS_CATALOG[activity.harnessType] : null;
            return (
              <li key={activity.activityId} className="rounded-xl border border-border/60 bg-background/30 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {catalog?.label ?? activity.harnessType} · {activity.title}
                    </p>
                    <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                      {activity.activityId} · creada {formatDateTime(activity.createdAt)}
                      {activity.finishedAt ? ` · cerrada ${formatDateTime(activity.finishedAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Pill label={badge.label} tone={badge.tone} />
                    <OriginPill origin="real" />
                  </div>
                </div>

                {activity.status === 'queued' && (
                  <p className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-[11px] text-sky-300">
                    En cola. El worker aún no la reclama. Inícialo con <span className="font-mono">npm run harness:worker</span>.
                  </p>
                )}
                {activity.status === 'running' && (
                  <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-300">
                    Ejecutando en el worker…
                  </p>
                )}
                {activity.error && (
                  <p className="mt-2 break-words rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">
                    {activity.error}
                  </p>
                )}
                {activity.status === 'completed' && <div className="mt-2"><ActivityResultBody activity={activity} /></div>}
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
