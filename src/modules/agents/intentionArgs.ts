// Mismo conjunto que convex/lib/harnessActivities.ts; se replica aquí para que el
// normalizador sea puro y testeable sin alias de Next.
const HARNESS_TYPES = ['support', 'b2b', 'prospecting', 'marketing'] as const;
type HarnessType = (typeof HARNESS_TYPES)[number];

function isHarnessType(value: unknown): value is HarnessType {
  return typeof value === 'string' && (HARNESS_TYPES as readonly string[]).includes(value);
}

export type NormalizedHarnessIntention = {
  harnessType: HarnessType;
  body: string;
};

const MAX_BODY_CHARS = 600;

function bodyText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} debe ser texto.`);
  const body = value.trim();
  if (!body) throw new Error(`${label} está vacía.`);
  if (body.length > MAX_BODY_CHARS) throw new Error(`${label} supera ${MAX_BODY_CHARS} caracteres.`);
  return body;
}

function entry(harnessTypeRaw: unknown, bodyRaw: unknown, label: string): NormalizedHarnessIntention {
  if (typeof harnessTypeRaw !== 'string' || !isHarnessType(harnessTypeRaw.trim())) {
    throw new Error(`${label} tiene un harnessType inválido.`);
  }
  return {
    harnessType: harnessTypeRaw.trim() as HarnessType,
    body: bodyText(bodyRaw, `${label}.body`),
  };
}

/**
 * Normaliza `harnessIntentions` aceptando las dos formas que produce el modelo:
 *
 *   - array: [{"harnessType":"support","body":"..."}] (forma canónica)
 *   - mapa:  {"support":"...", "b2b":{"body":"..."}} (forma observada en producción)
 *
 * Nunca ignora una entrada mal formada: lanza un error para que el turno falle
 * de forma honesta en lugar de reportar éxito con pérdida silenciosa.
 */
export function normalizeHarnessIntentions(input: unknown): NormalizedHarnessIntention[] {
  if (input === undefined || input === null) return [];

  const normalized: NormalizedHarnessIntention[] = [];

  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`harnessIntentions[${index}] debe ser un objeto.`);
      }
      const record = item as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (key !== 'harnessType' && key !== 'body') {
          throw new Error(`harnessIntentions[${index}] tiene una clave no permitida: ${key}.`);
        }
      }
      normalized.push(entry(record.harnessType, record.body, `harnessIntentions[${index}]`));
    });
  } else if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const looksLikeSingleEntry = 'harnessType' in record || 'body' in record;

    if (looksLikeSingleEntry) {
      normalized.push(entry(record.harnessType, record.body, 'harnessIntentions'));
    } else {
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') {
          normalized.push(entry(key, value, `harnessIntentions.${key}`));
          continue;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const item = value as Record<string, unknown>;
          for (const field of Object.keys(item)) {
            if (field !== 'harnessType' && field !== 'body') {
              throw new Error(`harnessIntentions.${key} tiene una clave no permitida: ${field}.`);
            }
          }
          if (item.harnessType !== undefined && String(item.harnessType).trim() !== key) {
            throw new Error(`harnessIntentions.${key}.harnessType no coincide con la clave.`);
          }
          normalized.push(entry(key, item.body, `harnessIntentions.${key}`));
          continue;
        }
        throw new Error(`harnessIntentions.${key} debe ser texto u objeto {body}.`);
      }
    }
  } else {
    throw new Error('harnessIntentions debe ser un objeto o una lista.');
  }

  const seen = new Set<string>();
  for (const item of normalized) {
    if (seen.has(item.harnessType)) {
      throw new Error(`harnessIntentions incluye el arnés duplicado ${item.harnessType}.`);
    }
    seen.add(item.harnessType);
  }

  return normalized;
}
