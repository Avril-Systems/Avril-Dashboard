export type LessonCandidate = { lesson: string; status: string };

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'has', 'was', 'were', 'are',
  'pero', 'para', 'como', 'este', 'esta', 'esto', 'esos', 'esas', 'porque', 'cuando', 'donde',
  'sobre', 'entre', 'desde', 'hasta', 'tambien', 'también', 'puede', 'pueden', 'debe', 'deben',
  'agente', 'agent', 'avril', 'sesion', 'sesión', 'intencion', 'intención', 'usuario',
]);

function tokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{4,}/g);
  return new Set((words ?? []).filter((word) => !STOPWORDS.has(word)));
}

/**
 * Recupera como máximo 3 lecciones relevantes para el mensaje actual, dentro de
 * ~800 caracteres (≈200 tokens). Sin coincidencia léxica, no inyecta nada.
 */
export function selectRelevantLessons(
  lessons: LessonCandidate[],
  message: string,
  options: { max?: number; maxChars?: number } = {}
): string[] {
  const max = Math.max(1, Math.min(options.max ?? 3, 3));
  const maxChars = Math.max(100, Math.min(options.maxChars ?? 800, 800));
  const messageTokens = tokens(message);
  if (messageTokens.size === 0) return [];

  const scored = lessons
    .map((lesson, index) => {
      const lessonTokens = tokens(lesson.lesson);
      let score = 0;
      for (const token of lessonTokens) {
        if (messageTokens.has(token)) score += 1;
      }
      return { lesson: lesson.lesson.trim(), score, index };
    })
    .filter((item) => item.lesson && item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: string[] = [];
  let used = 0;
  for (const item of scored) {
    if (selected.length >= max) break;
    const cost = item.lesson.length + (selected.length ? 1 : 0);
    if (used + cost > maxChars) continue;
    selected.push(item.lesson);
    used += cost;
  }
  return selected;
}
