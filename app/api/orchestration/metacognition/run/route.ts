import { NextResponse } from 'next/server';
import { listMetacognitionStates } from '@/src/lib/convexServer';
import { runMetacognitionCycle } from '@/src/lib/metacognitionRunner';
import { errorResponse, guardRequest, isSafeId } from '@/src/lib/swarmyServer';

/**
 * POST /api/orchestration/metacognition/run { sessionId, agentKey? }
 *
 * Trigger manual con la misma ruta acotada del ciclo periódico. Si no se pasa
 * agentKey, corre solo los agentes habilitados de la sesión (cadencia y lease se
 * respetan dentro del ciclo).
 */
export async function POST(req: Request) {
  const denied = guardRequest(req, 'metacognition:run', 30);
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      agentKey?: string;
    };
    const sessionId = body.sessionId?.trim();
    const agentKey = body.agentKey?.trim() || undefined;
    if (!isSafeId(sessionId)) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'sessionId es obligatorio' } },
        { status: 400 }
      );
    }
    if (agentKey && !isSafeId(agentKey)) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'agentKey inválido' } },
        { status: 400 }
      );
    }

    const targets = agentKey
      ? [agentKey]
      : (await listMetacognitionStates({ sessionId }))
          .filter((state) => state.enabled)
          .map((state) => state.agentKey);

    const results = [];
    for (const target of targets) {
      try {
        results.push(await runMetacognitionCycle({ sessionId, agentKey: target }));
      } catch (err) {
        results.push({
          agentKey: target,
          status: 'failed' as const,
          reason: err instanceof Error ? err.message : 'Error ejecutando el ciclo.',
        });
      }
    }

    return NextResponse.json({ ok: true, sessionId, results });
  } catch (err) {
    return errorResponse(err, 'METACOGNITION_RUN_FAILED');
  }
}
