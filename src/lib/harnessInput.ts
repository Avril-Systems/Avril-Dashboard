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

  const def = getActivityDef(harnessType);
  const raw = asRecord(rawInput);

  switch (def.key) {
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
