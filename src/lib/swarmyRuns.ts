/**
 * Lógica PURA: agrupa eventos (tabla orchestratorEvents) por runId para la lista workspace -> run.
 * No inventa nada: si un evento no trae runId se ignora.
 */
export type RunEventLike = { type: string; createdAt: string; runId?: string; payload?: unknown };

export type RunSummary = {
  runId: string;
  firstAt: string;
  lastAt: string;
  eventCount: number;
  lastType: string;
  hasMock: boolean;
  blocked: boolean;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function groupRuns(events: RunEventLike[]): RunSummary[] {
  const byRun = new Map<string, RunSummary>();
  for (const e of events) {
    const runId = typeof e.runId === 'string' ? e.runId.trim() : '';
    if (!runId) continue;
    const p = asRecord(e.payload);
    const isBlocked = e.type === 'error.reported' && String(p.status ?? '').toUpperCase() === 'BLOCKED';
    const cur = byRun.get(runId);
    if (!cur) {
      byRun.set(runId, {
        runId,
        firstAt: e.createdAt,
        lastAt: e.createdAt,
        eventCount: 1,
        lastType: e.type,
        hasMock: p.isMock === true,
        blocked: isBlocked,
      });
      continue;
    }
    cur.eventCount += 1;
    if (ms(e.createdAt) < ms(cur.firstAt)) cur.firstAt = e.createdAt;
    if (ms(e.createdAt) >= ms(cur.lastAt)) {
      cur.lastAt = e.createdAt;
      cur.lastType = e.type;
    }
    if (p.isMock === true) cur.hasMock = true;
    if (isBlocked) cur.blocked = true;
  }
  return [...byRun.values()].sort((a, b) => ms(b.lastAt) - ms(a.lastAt));
}
