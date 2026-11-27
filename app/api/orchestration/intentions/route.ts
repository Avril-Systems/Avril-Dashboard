import { NextResponse } from 'next/server';
import { getSessionIntentions } from '@/src/lib/convexServer';
import { errorResponse, guardRequest, isSafeId } from '@/src/lib/swarmyServer';

/**
 * GET /api/orchestration/intentions?sessionId=
 *
 * Intención general y particulares persistidas de una sesión. Solo lectura;
 * reutiliza la autenticación del dashboard.
 */
export async function GET(req: Request) {
  const denied = guardRequest(req, 'intentions', 120);
  if (denied) return denied;

  try {
    const sessionId = new URL(req.url).searchParams.get('sessionId')?.trim();
    if (!isSafeId(sessionId)) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'sessionId es obligatorio' } },
        { status: 400 }
      );
    }

    const intentions = await getSessionIntentions({ sessionId });
    return NextResponse.json({ ok: true, sessionId, ...intentions });
  } catch (err) {
    return errorResponse(err, 'INTENTIONS_FETCH_FAILED');
  }
}
