import { randomUUID } from 'node:crypto';
import {
  claimMetacognitionCycle,
  completeMetacognitionCycle,
  failMetacognitionCycle,
  getMetacognitionLessons,
  listMetacognitionExperience,
  skipMetacognitionCycle,
} from '@/src/lib/convexServer';
import { callOpenAICompatible, readInferenceConfig } from '@/src/lib/inference';
import { renderExperience, summarizeExperience } from '@/src/modules/metacognition/experience';
import { buildReflectionPrompt } from '@/src/modules/metacognition/prompt';
import { validateReflection } from '@/src/modules/metacognition/reflection';

export type MetacognitionRunResult = {
  agentKey: string;
  status: 'success' | 'skipped' | 'failed';
  reason?: string;
  lessonsAdded?: number;
  inputCount?: number;
};

/**
 * Ejecuta un ciclo de metacognición para un agente.
 *
 * - Un request de inferencia como máximo; sin reintentos.
 * - Sin experiencia nueva: cero inferencia.
 * - Fallo/timeout/JSON inválido: no mueve cursor ni lecciones; respeta cadencia.
 * - Independiente de intención, ejecución y trazabilidad de turnos.
 */
export async function runMetacognitionCycle(args: {
  sessionId: string;
  agentKey: string;
}): Promise<MetacognitionRunResult> {
  const leaseOwner = randomUUID();
  const claim = await claimMetacognitionCycle({
    sessionId: args.sessionId,
    agentKey: args.agentKey,
    leaseOwner,
  });

  if (!claim.ok) {
    return { agentKey: args.agentKey, status: 'skipped', reason: claim.reason };
  }

  let inferenceCalls = 0;
  let inputCount = 0;

  const fail = async (error: string) => {
    try {
      await failMetacognitionCycle({
        cycleId: claim.cycleId,
        leaseOwner,
        error,
        inferenceCalls,
        inputCount,
      });
    } catch {
      /* el lease pudo expirar; no se reintenta */
    }
    return {
      agentKey: args.agentKey,
      status: 'failed' as const,
      reason: error.slice(0, 200),
      inputCount,
    };
  };

  try {
    const experienceRows = await listMetacognitionExperience({
      sessionId: args.sessionId,
      agentKey: args.agentKey,
      since: claim.cursor,
      limit: 12,
      tenantId: process.env.SWARMY_TENANT_ID || null,
    });

    if (experienceRows.length === 0) {
      await skipMetacognitionCycle({
        cycleId: claim.cycleId,
        leaseOwner,
        inputCount: 0,
      });
      return { agentKey: args.agentKey, status: 'skipped', reason: 'no_experience' };
    }

    const batch = summarizeExperience(experienceRows);
    inputCount = batch.items.length;
    const priorLessons = await getMetacognitionLessons({
      sessionId: args.sessionId,
      agentKey: args.agentKey,
    });

    const config = readInferenceConfig();
    if (!config.ok) {
      return await fail(`Falta configuración de inferencia: ${config.missing.join(', ')}.`);
    }

    const prompt = buildReflectionPrompt({
      agentKey: args.agentKey,
      experience: renderExperience(batch),
      priorLessons: priorLessons.map((lesson) => lesson.lesson),
    });

    inferenceCalls = 1;
    const result = await callOpenAICompatible({
      config: config.config,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.2,
      maxTokens: 400,
      timeoutMs: 30_000,
    });

    if (!result.ok) return await fail(result.message);

    const parsed = validateReflection(result.text);
    if (!parsed.ok) return await fail(parsed.error);

    const cursorAfter = experienceRows[experienceRows.length - 1].createdAt;
    const completed = await completeMetacognitionCycle({
      cycleId: claim.cycleId,
      leaseOwner,
      lessons: parsed.lessons,
      cursorAfter,
      inputCount,
      model: config.config.model,
    });

    if (!completed.ok) {
      return {
        agentKey: args.agentKey,
        status: 'failed',
        reason: completed.reason ?? 'complete_rejected',
        inputCount,
      };
    }

    return {
      agentKey: args.agentKey,
      status: 'success',
      lessonsAdded: completed.added ?? 0,
      inputCount,
    };
  } catch (err) {
    return await fail(err instanceof Error ? err.message : 'Error ejecutando el ciclo.');
  }
}
