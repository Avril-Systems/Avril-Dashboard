import { NextResponse } from 'next/server';
import {
  enableMetacognition,
  getMetacognitionLessons,
  listMetacognitionCycles,
  listMetacognitionStates,
} from '@/src/lib/convexServer';
import { errorResponse, guardRequest, isSafeId } from '@/src/lib/swarmyServer';

/**
 * GET  /api/orchestration/metacognition?sessionId=&agentKey=
 * POST /api/orchestration/metacognition { sessionId, agentKey, enabled, cadenceMs? }
 *
 * Habilitación explícita (deshabilitada por defecto) y consulta de estado/lecciones.
 */
export async function GET(req: Request) {
  const denied = guardRequest(req, 'metacognition', 120);
  if (denied) return denied;

  try {
    const params = new URL(req.url).searchParams;
    const sessionId = params.get('sessionId')?.trim();
    const agentKey = params.get('agentKey')?.trim() || undefined;
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

    const states = await listMetacognitionStates({ sessionId });
    if (!agentKey) {
      return NextResponse.json({ ok: true, sessionId, states });
    }

    const state = states.find((row) => row.agentKey === agentKey) ?? null;
    const [lessons, cycles] = await Promise.all([
      getMetacognitionLessons({ sessionId, agentKey }),
      listMetacognitionCycles({ sessionId, agentKey, limit: 10 }),
    ]);
    return NextResponse.json({ ok: true, sessionId, agentKey, state, lessons, cycles });
  } catch (err) {
    return errorResponse(err, 'METACOGNITION_FETCH_FAILED');
  }
}

export async function POST(req: Request) {
  const denied = guardRequest(req, 'metacognition:enable', 30);
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      agentKey?: string;
      enabled?: boolean;
      cadenceMs?: number;
    };
    const sessionId = body.sessionId?.trim();
    const agentKey = body.agentKey?.trim();
    if (!isSafeId(sessionId) || !isSafeId(agentKey) || typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'sessionId, agentKey y enabled son obligatorios' },
        },
        { status: 400 }
      );
    }

    const result = await enableMetacognition({
      sessionId,
      agentKey,
      enabled: body.enabled,
      ...(typeof body.cadenceMs === 'number' ? { cadenceMs: body.cadenceMs } : {}),
    });
    return NextResponse.json({ ok: true, sessionId, agentKey, ...result });
  } catch (err) {
    return errorResponse(err, 'METACOGNITION_ENABLE_FAILED');
  }
}
