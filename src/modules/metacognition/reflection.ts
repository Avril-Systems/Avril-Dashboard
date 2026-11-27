import {
  MAX_EXPERIENCE_REFS,
  MAX_LESSON_CHARS,
  MAX_REFLECTION_LESSONS,
} from './skill.ts';

export type ReflectionLesson = {
  lesson: string;
  status: 'tentative' | 'observed';
  experienceRefs?: string[];
};

export type ReflectionValidation =
  | { ok: true; lessons: ReflectionLesson[] }
  | { ok: false; error: string };

/** Quita un único fence ```json ... ``` si el modelo lo añadió. */
function stripFence(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('```')) return text;
  const lines = text.split(/\r?\n/);
  if (lines.length < 3) return text;
  return lines.slice(1, -1).join('\n').trim();
}

/**
 * Valida localmente el JSON de reflexión. Un fallo termina el ciclo; no hay
 * reparación ni reintento.
 */
export function validateReflection(raw: string): ReflectionValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return { ok: false, error: 'La reflexión no es JSON válido.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'La reflexión debe ser un objeto JSON.' };
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'lessons') return { ok: false, error: `Clave no permitida: ${key}.` };
  }
  if (!Array.isArray(record.lessons)) {
    return { ok: false, error: 'Falta el array "lessons".' };
  }
  if (record.lessons.length > MAX_REFLECTION_LESSONS) {
    return { ok: false, error: `Demasiadas lecciones (máx ${MAX_REFLECTION_LESSONS}).` };
  }

  const lessons: ReflectionLesson[] = [];
  for (const [index, item] of record.lessons.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `lessons[${index}] debe ser un objeto.` };
    }
    const row = item as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (!['lesson', 'status', 'experienceRefs'].includes(key)) {
        return { ok: false, error: `lessons[${index}] tiene una clave no permitida: ${key}.` };
      }
    }
    const lesson = typeof row.lesson === 'string' ? row.lesson.trim() : '';
    if (!lesson || lesson.length > MAX_LESSON_CHARS) {
      return { ok: false, error: `lessons[${index}].lesson inválida (1..${MAX_LESSON_CHARS}).` };
    }
    if (row.status !== 'tentative' && row.status !== 'observed') {
      return { ok: false, error: `lessons[${index}].status inválido.` };
    }

    let experienceRefs: string[] | undefined;
    if (row.experienceRefs !== undefined) {
      if (!Array.isArray(row.experienceRefs) || row.experienceRefs.length > MAX_EXPERIENCE_REFS) {
        return { ok: false, error: `lessons[${index}].experienceRefs inválido.` };
      }
      const refs: string[] = [];
      for (const ref of row.experienceRefs) {
        if (typeof ref !== 'string' || !ref.trim() || ref.length > 128 || refs.includes(ref)) {
          return { ok: false, error: `lessons[${index}].experienceRefs inválido.` };
        }
        refs.push(ref);
      }
      experienceRefs = refs;
    }

    lessons.push({
      lesson,
      status: row.status,
      ...(experienceRefs ? { experienceRefs } : {}),
    });
  }

  return { ok: true, lessons };
}
