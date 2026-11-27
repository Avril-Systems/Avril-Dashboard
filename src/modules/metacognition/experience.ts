export type ExperienceInput = {
  _id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type ExperienceSummary = {
  ref: string;
  summary: string;
};

export type ExperienceBatch = {
  items: ExperienceSummary[];
  chars: number;
  omitted: number;
};

/**
 * Compacta la experiencia para el prompt de reflexión.
 * Máximo 12 registros, 240 caracteres por registro y 6000 caracteres totales.
 */
export function summarizeExperience(
  messages: ExperienceInput[],
  options: { maxRecords?: number; maxCharsPerRecord?: number; maxChars?: number } = {}
): ExperienceBatch {
  const maxRecords = Math.max(1, Math.min(options.maxRecords ?? 12, 12));
  const maxCharsPerRecord = Math.max(60, Math.min(options.maxCharsPerRecord ?? 240, 240));
  const maxChars = Math.max(500, Math.min(options.maxChars ?? 6000, 6000));

  const items: ExperienceSummary[] = [];
  let chars = 0;
  let omitted = 0;

  for (const message of messages) {
    if (items.length >= maxRecords || chars >= maxChars) {
      omitted += 1;
      continue;
    }
    const compact = message.content.replace(/\s+/g, ' ').trim();
    if (!compact) continue;
    const remaining = maxChars - chars;
    const limit = Math.min(maxCharsPerRecord, remaining);
    if (limit < 40) {
      omitted += 1;
      continue;
    }
    const summary =
      compact.length <= limit ? compact : `${compact.slice(0, Math.max(0, limit - 1))}…`;
    const line = `[${message.role}] ${summary}`;
    items.push({ ref: message._id.slice(0, 128), summary: line });
    chars += line.length + 1;
  }

  return { items, chars, omitted };
}

export function renderExperience(batch: ExperienceBatch): string {
  return batch.items.map((item) => `${item.summary} (ref: ${item.ref})`).join('\n');
}
