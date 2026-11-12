/**
 * Lógica PURA (sin React, sin red, sin Convex) para Agent Office S00.
 * Deriva, a partir de `orchestrationEvents`:
 *   1. la cadena: reporte de soporte → handoff → ACK → diagnóstico → patch/PR → aprobación → resultado
 *   2. el estado verificable de pausa/stop (enviado ≠ confirmado)
 *
 * Reglas de honestidad:
 *   - Un eslabón solo es "done" si existe su evento. Nunca se infiere.
 *   - Cada eslabón declara su origen: mock | real | unknown (según payload.isMock).
 *   - Pausa/stop solo es "confirmed" si llegó un evento de confirmación posterior al comando.
 *
 * Sintaxis compatible con Node (type stripping): sin enums ni imports en tiempo de ejecución.
 * Contrato de eventos: ver CHAIN_STEPS y CONTROL_CONFIRMATIONS (acordar con Alejandro).
 */

export type EventItem = {
  _id: string;
  type: string;
  createdAt: string;
  payload?: unknown;
};

export type Origin = 'mock' | 'real' | 'unknown';
export type StepState = 'pending' | 'done' | 'failed';

export const CHAIN_STEPS = [
  { key: 'support.report.received', label: 'Reporte de soporte' },
  { key: 'handoff.created', label: 'Handoff a DeepSeek' },
  { key: 'handoff.ack', label: 'ACK' },
  { key: 'diagnosis.ready', label: 'Diagnóstico' },
  { key: 'patch.proposed', label: 'Patch / PR propuesto' },
  { key: 'approval.decided', label: 'Aprobación' },
  { key: 'run.result', label: 'Resultado' },
] as const;

export type ChainStep = {
  key: string;
  label: string;
  state: StepState;
  at?: string;
  origin: Origin;
  detail?: string;
  evidenceRef?: string;
};

export type ChainError = {
  message: string;
  step?: string;
  recoverable?: boolean;
  at: string;
  origin: Origin;
};

export type ChainView = {
  handoffId?: string;
  steps: ChainStep[];
  errors: ChainError[];
  warnings: string[];
  complete: boolean;
  blocked?: { step: string; message: string };
  hasMockData: boolean;
};

// ---------- helpers ----------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function originOf(payload: unknown): Origin {
  const m = asRecord(payload).isMock;
  return m === true ? 'mock' : m === false ? 'real' : 'unknown';
}

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

const DUPLICATE_WINDOW_MS = 2000;

/** El WS manager registra algunos eventos dos veces (evento específico + genérico). */
function sortAndDedupe(events: EventItem[]): EventItem[] {
  const sorted = [...events].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const lastSeen = new Map<string, number>();
  const out: EventItem[] = [];
  for (const e of sorted) {
    const key = e.type + '|' + stable(e.payload);
    const t = ms(e.createdAt);
    const prev = lastSeen.get(key);
    if (prev !== undefined && t - prev < DUPLICATE_WINDOW_MS) continue;
    lastSeen.set(key, t);
    out.push(e);
  }
  return out;
}

function lastOf<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

function detailFor(key: string, p: Record<string, unknown>): string | undefined {
  switch (key) {
    case 'support.report.received':
      return [str(p.ticketId), str(p.severity)].filter(Boolean).join(' · ') || undefined;
    case 'handoff.created':
      return `${str(p.from) ?? '?'} → ${str(p.to) ?? '?'}`;
    case 'handoff.ack':
      return str(p.ackAt);
    case 'diagnosis.ready':
      return str(p.summary);
    case 'patch.proposed':
      return str(p.prRef) ?? str(p.patchRef);
    case 'approval.decided':
      return [str(p.decision), str(p.decidedBy)].filter(Boolean).join(' · ') || undefined;
    case 'run.result':
      return str(p.outcome);
    default:
      return undefined;
  }
}

// ---------- cadena de handoff ----------

export function deriveHandoffChain(rawEvents: EventItem[]): ChainView {
  const events = sortAndDedupe(rawEvents);

  const lastCreated = lastOf(events.filter((e) => e.type === 'handoff.created'));
  const createdPayload = asRecord(lastCreated?.payload);
  const handoffId = str(createdPayload.handoffId);
  const ticketId = str(createdPayload.ticketId);

  const errorEvents = events.filter((e) => {
    if (e.type !== 'error.reported') return false;
    const hid = str(asRecord(e.payload).handoffId);
    return !hid || !handoffId || hid === handoffId;
  });

  const steps: ChainStep[] = CHAIN_STEPS.map((def) => {
    let candidates = events.filter((e) => e.type === def.key);

    if (def.key === 'support.report.received') {
      if (ticketId) {
        candidates = candidates.filter((e) => str(asRecord(e.payload).ticketId) === ticketId);
      } else if (lastCreated) {
        candidates = candidates.filter((e) => ms(e.createdAt) <= ms(lastCreated.createdAt));
      }
    } else if (def.key === 'handoff.created') {
      candidates = lastCreated ? [lastCreated] : [];
    } else if (handoffId) {
      candidates = candidates.filter((e) => str(asRecord(e.payload).handoffId) === handoffId);
    } else {
      candidates = [];
    }

    const ev = lastOf(candidates);
    if (!ev) return { key: def.key, label: def.label, state: 'pending', origin: 'unknown' };

    const p = asRecord(ev.payload);
    let state: StepState = 'done';
    if (def.key === 'run.result') {
      const outcome = (str(p.outcome) ?? '').toLowerCase();
      if (outcome === 'failed' || outcome === 'error') state = 'failed';
    }
    const failedByError = errorEvents.some(
      (e) => str(asRecord(e.payload).step) === def.key && ms(e.createdAt) >= ms(ev.createdAt)
    );
    if (failedByError) state = 'failed';

    return {
      key: def.key,
      label: def.label,
      state,
      at: ev.createdAt,
      origin: originOf(ev.payload),
      detail: detailFor(def.key, p),
      evidenceRef: str(p.evidenceRef) ?? str(p.prRef) ?? str(p.patchRef),
    };
  });

  // Un error que apunta a un eslabón aún sin evento también lo marca como fallido.
  for (const e of errorEvents) {
    const stepKey = str(asRecord(e.payload).step);
    const target = steps.find((s) => s.key === stepKey);
    if (target && target.state === 'pending') target.state = 'failed';
  }

  const errors: ChainError[] = errorEvents.map((e) => {
    const p = asRecord(e.payload);
    return {
      message: str(p.message) ?? 'Error sin detalle',
      step: str(p.step),
      recoverable: typeof p.recoverable === 'boolean' ? p.recoverable : undefined,
      at: e.createdAt,
      origin: originOf(e.payload),
    };
  });

  const warnings: string[] = [];
  for (let i = 1; i < steps.length; i += 1) {
    if (steps[i].state === 'done' && steps[i - 1].state === 'pending') {
      warnings.push(`${steps[i].label} registrado sin ${steps[i - 1].label}`);
    }
  }

  const failedStep = steps.find((s) => s.state === 'failed');
  const blocked = failedStep
    ? {
        step: failedStep.label,
        message: errors.find((e) => e.step === failedStep.key)?.message ?? 'El eslabón terminó en fallo',
      }
    : undefined;

  return {
    handoffId,
    steps,
    errors,
    warnings,
    complete: steps.every((s) => s.state === 'done'),
    blocked,
    hasMockData: steps.some((s) => s.origin === 'mock') || errors.some((e) => e.origin === 'mock'),
  };
}

// ---------- pausa / stop verificables ----------

export type ControlState = 'sent_unconfirmed' | 'confirmed' | 'unconfirmed_timeout';

export type ControlView = {
  agentKey: string;
  command: 'pause' | 'kill';
  state: ControlState;
  sentAt: string;
  confirmedAt?: string;
  origin: Origin;
};

export const CONTROL_CONFIRMATIONS = {
  pause: { eventType: 'agent.paused', statusPattern: /pause/i },
  kill: { eventType: 'agent.stopped', statusPattern: /(stop|kill|terminat)/i },
} as const;

export const CONTROL_CONFIRM_TIMEOUT_MS = 15000;

function agentKeyOf(p: Record<string, unknown>): string | undefined {
  return str(p.agentKey) ?? str(p.agentId);
}

export function deriveRunControl(
  rawEvents: EventItem[],
  nowMs: number,
  timeoutMs: number = CONTROL_CONFIRM_TIMEOUT_MS
): ControlView[] {
  const events = [...rawEvents].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const lastByAgent = new Map<string, EventItem>();
  for (const e of events) {
    if (e.type !== 'agent.command.sent') continue;
    const p = asRecord(e.payload);
    const key = agentKeyOf(p);
    if (key && (p.command === 'pause' || p.command === 'kill')) lastByAgent.set(key, e);
  }

  const views: ControlView[] = [];
  for (const [agentKey, sent] of lastByAgent) {
    const command = asRecord(sent.payload).command as 'pause' | 'kill';
    const rule = CONTROL_CONFIRMATIONS[command];
    const sentAtMs = ms(sent.createdAt);

    const confirmation = events.find((e) => {
      if (ms(e.createdAt) < sentAtMs) return false;
      const p = asRecord(e.payload);
      if (agentKeyOf(p) !== agentKey) return false;
      if (e.type === rule.eventType) return true;
      if (e.type === 'agent.status') {
        return rule.statusPattern.test(String(p.status ?? p.state ?? ''));
      }
      return false;
    });

    const state: ControlState = confirmation
      ? 'confirmed'
      : nowMs - sentAtMs > timeoutMs
        ? 'unconfirmed_timeout'
        : 'sent_unconfirmed';

    views.push({
      agentKey,
      command,
      state,
      sentAt: sent.createdAt,
      confirmedAt: confirmation?.createdAt,
      origin: confirmation ? originOf(confirmation.payload) : originOf(sent.payload),
    });
  }
  return views;
}
