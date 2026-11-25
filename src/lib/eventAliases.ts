/**
 * Normaliza eventos del backend al contrato interno de handoffChain.ts.
 * Motivo: el SDD (§2) nombra los eventos distinto que el PR #4.
 *   SDD:  handoff.acknowledged, task.completed, supportReportRef, pullRequestRef, approvalStatus, codeTaskId
 *   PR#4: handoff.ack, run.result, ticketId, prRef, decision, handoffId
 * Aceptamos AMBOS. Si Alejandro confirma un solo nombre, se borra el alias sobrante.
 *
 * Lógica PURA, sin React/red/Convex. No muta los eventos originales.
 * ASUNCIONES (marcadas para confirmar con Alejandro): ver ASSUMPTIONS al final.
 */
import type { EventItem } from './handoffChain.ts';

/** tipo recibido -> tipo canónico usado por CHAIN_STEPS */
export const EVENT_TYPE_ALIASES: Record<string, string> = {
  'handoff.acknowledged': 'handoff.ack',
  'task.completed': 'run.result',
  'task.failed': 'run.result',
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function normalizeEvent(e: EventItem): EventItem {
  const type = EVENT_TYPE_ALIASES[e.type] ?? e.type;
  const src = asRecord(e.payload);
  const p: Record<string, unknown> = { ...src };

  // Campos del contrato SDD -> campos internos (solo si el interno no existe)
  if (p.ticketId === undefined && str(src.supportReportRef)) p.ticketId = src.supportReportRef;
  if (p.prRef === undefined && str(src.pullRequestRef)) p.prRef = src.pullRequestRef;
  if (p.decision === undefined && str(src.approvalStatus)) p.decision = src.approvalStatus;
  if (p.handoffId === undefined && str(src.codeTaskId)) p.handoffId = src.codeTaskId;

  // task.completed / task.failed -> run.result con outcome
  if (type === 'run.result' && p.outcome === undefined) {
    if (e.type === 'task.failed') {
      p.outcome = 'failed';
    } else {
      const s = (str(src.status) ?? '').toLowerCase();
      if (s === 'failed' || s === 'error') p.outcome = 'failed';
      else if (s === 'completed' || s === 'success' || s === 'succeeded' || s === '') p.outcome = 'ok';
      else p.outcome = s; // estado desconocido: se muestra tal cual, no se maquilla
    }
  }

  const changed = type !== e.type || Object.keys(p).length !== Object.keys(src).length;
  return changed ? { ...e, type, payload: p } : e;
}

export function normalizeEvents(events: EventItem[]): EventItem[] {
  return events.map(normalizeEvent);
}

export const ASSUMPTIONS = [
  'task.completed => run.result (outcome ok); task.failed => run.result (outcome failed)',
  'codeTaskId se usa como handoffId cuando handoffId no viene',
  'supportReportRef se usa como ticketId para emparejar el reporte con el handoff',
] as const;
