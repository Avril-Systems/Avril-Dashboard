import { NextResponse } from 'next/server';
import { errorResponse, getHarnessConnections, getRunEvents, guardRequest, isSafeId } from '@/src/lib/swarmyServer';

/** Un run: eventos (por runId) + heartbeats de los arneses. Todo persistido en Convex. */
export async function GET(req: Request) {
  const denied = guardRequest(req, 'run', 180);
  if (denied) return denied;
  try {
    const runId = new URL(req.url).searchParams.get('runId')?.trim();
    if (!isSafeId(runId)) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'runId inválido o ausente' } }, { status: 400 });
    }
    const [events, agents] = await Promise.all([getRunEvents(runId), getHarnessConnections()]);
    return NextResponse.json({ ok: true, runId, events, agents });
  } catch (err) {
    return errorResponse(err, 'RUN_FETCH_FAILED');
  }
}
