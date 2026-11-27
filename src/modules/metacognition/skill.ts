/** Texto de SKILL.md (Metacognition v0.1, gerryalvrz/metacognition). */
export const METACOGNITION_SKILL = `# Metacognition

Notice recurring difficulties, limitations, and useful strategies in recent experience. Consider when a different approach, less effort, more information, or help would be useful. Retain only concise, actionable lessons that could improve future work. Treat uncertain conclusions as tentative; no change is a valid outcome.

Do not redo tasks, gather new evidence, or change assigned intentions, permissions, or budgets. Return the requested structured reflection and stop.`;

/** Contrato de salida (reflection.schema.json). */
export const REFLECTION_CONTRACT = `Devuelve SOLO JSON con esta forma:
{"lessons":[{"lesson":"texto breve","status":"tentative|observed","experienceRefs":["id"]}]}
- lessons: máximo 3.
- lesson: 1..240 caracteres.
- status: tentative u observed (observed = patrón observado, no recomendación probada).
- experienceRefs: opcional, máximo 3 ids de la experiencia.
- Sin claves extra. Si no hay nada útil: {"lessons":[]}.`;

export const MAX_REFLECTION_LESSONS = 3;
export const MAX_LESSON_CHARS = 240;
export const MAX_EXPERIENCE_REFS = 3;
