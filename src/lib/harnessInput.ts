/**
 * Normalización/validación de inputs de actividades (solo servidor).
 * La UI manda strings; aquí se convierten a estructuras seguras antes de
 * persistirlas o de que el worker haga peticiones externas.
 *
 * Regla: nunca aceptar hosts privados/localhost para las actividades que hacen
 * fetch (B2B y marketing). El worker corre en la máquina del operador; no
 * queremos convertirlo en un proxy hacia la red interna.
 */
import { clampInt, getActivityDef, isActivityForHarness, isHarnessType } from '../../convex/lib/harnessActivities.ts';
import type { HarnessType } from '../../convex/lib/harnessActivities.ts';

export class HarnessInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HarnessInputError';
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Acepta un JSON en texto (lo que manda la UI) o un valor ya parseado. */
function parseJsonValue(v: unknown, field: string, maxBytes = 30_000): unknown {
  if (v === undefined || v === null || v === '') return undefined;
  let parsed = v;
  if (typeof v === 'string') {
    if (v.length > maxBytes) throw new HarnessInputError(`${field} es demasiado grande.`);
    try {
      parsed = JSON.parse(v);
    } catch {
      throw new HarnessInputError(`${field} no es JSON válido.`);
    }
  }
  if (JSON.stringify(parsed).length > maxBytes) throw new HarnessInputError(`${field} es demasiado grande.`);
  return parsed;
}

function splitList(v: unknown, max: number, maxLen: number, separator: RegExp = /[\n,]+/): string[] {
  const raw = typeof v === 'string' ? v : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join('\n') : '';
  const parts = raw
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part.length > maxLen) throw new HarnessInputError(`Cada valor debe tener ${maxLen} caracteres o menos.`);
    if (!out.includes(part)) out.push(part);
    if (out.length > max) throw new HarnessInputError(`Máximo ${max} valores.`);
  }
  return out;
}

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const octets = m.slice(1).map(Number);
  if (octets.some((n) => n < 0 || n > 255)) return true;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** Solo http(s) públicos. Rechaza localhost, .local/.internal y rangos privados. */
export function normalizePublicUrl(raw: unknown): string {
  let value = text(raw);
  if (!value) throw new HarnessInputError('Falta una URL.');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HarnessInputError(`URL inválida: ${value.slice(0, 120)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HarnessInputError('Solo se aceptan URLs http(s).');
  }
  if (url.username || url.password) {
    throw new HarnessInputError('No se aceptan credenciales embebidas en la URL.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80') ||
    isPrivateIpv4(host)
  ) {
    throw new HarnessInputError('No se permiten hosts privados ni localhost.');
  }
  if (!host.includes('.') && !host.includes(':')) {
    throw new HarnessInputError('El host debe ser un dominio público.');
  }
  if (url.toString().length > 300) throw new HarnessInputError('La URL es demasiado larga.');
  return url.toString();
}

export type NormalizedActivityInput = Record<string, unknown>;

/** Valida el par arnés/actividad y normaliza el input según el catálogo. */
export function normalizeActivityInput(
  harnessType: unknown,
  activity: unknown,
  rawInput: unknown
): { harnessType: HarnessType; input: NormalizedActivityInput } {
  if (!isHarnessType(harnessType)) throw new HarnessInputError('Arnés no válido.');
  if (!isActivityForHarness(harnessType, activity)) throw new HarnessInputError('Actividad no válida para ese arnés.');

  const def = getActivityDef(harnessType, activity as string);
  // La UI manda los defaults, pero la API también debe funcionar sin input:
  // se aplican los defaultValue del catálogo antes de normalizar.
  const defaults: Record<string, unknown> = {};
  for (const field of def.inputFields) {
    if (field.defaultValue !== undefined) defaults[field.key] = field.defaultValue;
  }
  const raw = { ...defaults, ...asRecord(rawInput) };

  switch (def.key) {
    case 'github_discovery_original': {
      // El prototipo original no acepta parámetros: usa su configuración y sus 7 búsquedas.
      return { harnessType, input: {} };
    }
    case 'b2b_intake_original': {
      const solicitudesRaw = parseJsonValue(raw.solicitudes, 'solicitudes', 60_000);
      let solicitudes: unknown[] | undefined;
      if (solicitudesRaw !== undefined) {
        solicitudes = Array.isArray(solicitudesRaw) ? solicitudesRaw : [solicitudesRaw];
        if (!solicitudes.length) throw new HarnessInputError('solicitudes no puede estar vacío.');
        if (solicitudes.length > 20) throw new HarnessInputError('Máximo 20 solicitudes por actividad.');
        for (const [index, item] of solicitudes.entries()) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new HarnessInputError(`solicitudes[${index}] debe ser un objeto.`);
          }
          if (typeof (item as Record<string, unknown>).mensaje !== 'string') {
            throw new HarnessInputError(`solicitudes[${index}] debe incluir "mensaje".`);
          }
        }
      }
      const sectorRaw = parseJsonValue(raw.sector, 'sector', 30_000);
      if (sectorRaw !== undefined && (typeof sectorRaw !== 'object' || Array.isArray(sectorRaw))) {
        throw new HarnessInputError('sector debe ser un objeto JSON.');
      }
      const modo = text(raw.modo) || 'reglas';
      if (modo !== 'reglas' && modo !== 'modelo') throw new HarnessInputError('modo debe ser reglas o modelo.');
      return {
        harnessType,
        input: {
          ...(solicitudes ? { solicitudes } : {}),
          ...(sectorRaw ? { sector: sectorRaw } : {}),
          modo,
        },
      };
    }
    case 'support_ticket_triage': {
      const rawTicket = parseJsonValue(raw.ticket, 'ticket', 60_000);
      if (rawTicket === undefined) throw new HarnessInputError('Falta el ticket JSON.');
      const tickets = Array.isArray(rawTicket) ? rawTicket : [rawTicket];
      if (!tickets.length) throw new HarnessInputError('El ticket no puede estar vacío.');
      if (tickets.length > 20) throw new HarnessInputError('Máximo 20 tickets por actividad.');
      for (const [index, item] of tickets.entries()) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new HarnessInputError(`ticket[${index}] debe ser un objeto SupportTicketRecord.`);
        }
        const record = item as Record<string, unknown>;
        if (typeof record.message !== 'string' || !record.message.trim()) {
          throw new HarnessInputError(`ticket[${index}] debe incluir "message".`);
        }
        if (typeof record.ticketId !== 'string' && typeof record.id !== 'string') {
          throw new HarnessInputError(`ticket[${index}] debe incluir "ticketId".`);
        }
      }
      return { harnessType, input: { ticket: Array.isArray(rawTicket) ? tickets : tickets[0] } };
    }
    case 'marketing_campaign': {
      const rawBriefing = parseJsonValue(raw.briefing, 'briefing', 60_000);
      if (rawBriefing !== undefined) {
        if (!rawBriefing || typeof rawBriefing !== 'object' || Array.isArray(rawBriefing)) {
          throw new HarnessInputError('briefing debe ser un objeto JSON.');
        }
        const obj = rawBriefing as Record<string, unknown>;
        const pieces = Array.isArray(obj.piezas) ? obj.piezas : null;
        if (pieces) {
          if (!pieces.length) throw new HarnessInputError('briefing.piezas no puede estar vacío.');
          if (pieces.length > 5) throw new HarnessInputError('Máximo 5 piezas por campaña.');
        } else if (typeof obj.tipo_pieza !== 'string') {
          throw new HarnessInputError('briefing debe incluir "piezas" o "tipo_pieza".');
        }
      }
      const modelo = text(raw.modelo).slice(0, 100);
      return {
        harnessType,
        input: {
          ...(rawBriefing !== undefined ? { briefing: rawBriefing } : {}),
          ...(modelo ? { modelo } : {}),
        },
      };
    }
    case 'github_discovery': {
      const queries = splitList(raw.queries, 7, 200, /[\n]+/);
      const maxCandidates = clampInt(raw.maxCandidates, 5, 40, 20);
      return {
        harnessType,
        input: { ...(queries.length ? { queries } : {}), maxCandidates },
      };
    }
    case 'account_qualification': {
      const targetsRaw = splitList(raw.targets, 20, 300, /[\n]+/);
      if (!targetsRaw.length) throw new HarnessInputError('Añade al menos un dominio o URL para calificar.');
      const targets = targetsRaw.map((t) => normalizePublicUrl(t));
      return { harnessType, input: { targets } };
    }
    case 'site_audit': {
      const url = normalizePublicUrl(text(raw.url) || 'https://avril.systems');
      const keywords = [...new Set(splitList(raw.keywords, 10, 40).map((k) => k.toLowerCase()))];
      return { harnessType, input: { url, ...(keywords.length ? { keywords } : {}) } };
    }
    case 'incident_triage': {
      const lookbackHours = clampInt(raw.lookbackHours, 1, 168, 24);
      const severity = text(raw.severity).slice(0, 40);
      return { harnessType, input: { lookbackHours, ...(severity ? { severity } : {}) } };
    }
    default: {
      throw new HarnessInputError('Actividad sin normalizador.');
    }
  }
}
