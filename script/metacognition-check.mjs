import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReflection } from '../src/modules/metacognition/reflection.ts';
import { selectRelevantLessons } from '../src/modules/metacognition/lessons.ts';
import { renderExperience, summarizeExperience } from '../src/modules/metacognition/experience.ts';
import { buildReflectionPrompt } from '../src/modules/metacognition/prompt.ts';

test('validateReflection acepta lecciones válidas', () => {
  const result = validateReflection(
    '{"lessons":[{"lesson":"Pedir el ticket completo antes de triar.","status":"observed","experienceRefs":["m1"]}]}'
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.lessons.length, 1);
});

test('validateReflection acepta lecciones vacías', () => {
  const result = validateReflection('{"lessons":[]}');
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.lessons, []);
});

test('validateReflection tolera un fence ```json', () => {
  const result = validateReflection('```json\n{"lessons":[]}\n```');
  assert.equal(result.ok, true);
});

test('validateReflection rechaza JSON inválido y claves extra', () => {
  assert.equal(validateReflection('no-json').ok, false);
  assert.equal(validateReflection('{"lessons":[],"extra":1}').ok, false);
});

test('validateReflection rechaza más de 3 lecciones y status inválido', () => {
  const tooMany = { lessons: Array.from({ length: 4 }, () => ({ lesson: 'x', status: 'tentative' })) };
  assert.equal(validateReflection(JSON.stringify(tooMany)).ok, false);
  assert.equal(validateReflection('{"lessons":[{"lesson":"x","status":"cierto"}]}').ok, false);
});

test('selectRelevantLessons elige por coincidencia y respeta límites', () => {
  const lessons = [
    { lesson: 'Pedir el ticket completo antes de triar.', status: 'observed' },
    { lesson: 'Confirmar la URL antes de auditar el sitio.', status: 'tentative' },
    { lesson: 'No enviar borradores sin revisión.', status: 'observed' },
  ];
  const selected = selectRelevantLessons(lessons, 'El ticket de soporte llegó incompleto', {});
  assert.equal(selected.length, 1);
  assert.match(selected[0], /ticket/);
  assert.deepEqual(selectRelevantLessons(lessons, 'hola'), []);
});

test('selectRelevantLessons nunca pasa de 3 ni de 800 caracteres', () => {
  const lessons = Array.from({ length: 6 }, (_, i) => ({
    lesson: `ticket ${'x'.repeat(200)} ${i}`,
    status: 'tentative',
  }));
  const selected = selectRelevantLessons(lessons, 'ticket ticket ticket', {});
  assert.ok(selected.length <= 3);
  assert.ok(selected.join('\n').length <= 800);
});

test('summarizeExperience acota registros y caracteres', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    _id: `m${i}`,
    role: i % 2 ? 'agent' : 'human',
    content: 'x'.repeat(500),
    createdAt: new Date(1700000000000 + i).toISOString(),
  }));
  const batch = summarizeExperience(messages);
  assert.ok(batch.items.length <= 12);
  assert.ok(batch.chars <= 6000);
  assert.ok(batch.omitted > 0);
  assert.ok(renderExperience(batch).includes('(ref: m0)'));
});

test('buildReflectionPrompt incluye skill, contrato y datos delimitados', () => {
  const prompt = buildReflectionPrompt({
    agentKey: 'b2b',
    experience: '[human] hola',
    priorLessons: ['lección previa'],
  });
  assert.match(prompt.system, /Metacognition/);
  assert.match(prompt.system, /"lessons"/);
  assert.match(prompt.user, /<experience>/);
  assert.match(prompt.user, /<prior_lessons>/);
  assert.match(prompt.system, /Agente: b2b/);
});
