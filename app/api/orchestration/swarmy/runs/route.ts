import { NextResponse } from 'next/server';
import { errorResponse, guardRequest, listTenantEvents } from '@/src/lib/swarmyServer';
import { groupRuns } from '@/src/lib/swarmyRuns';

/** Lista de runs del tenant (workspace -> run), agrupando eventos de orchestratorEvents por runId. */
export async function GET(req: Request) {
  const denied = guardRequest(req, 'runs', 60);
  if (denied) return denied;
  try {
    const events = await listTenantEvents(500);
    return NextResponse.json({ ok: true, runs: groupRuns(events) });
  } catch (err) {
    return errorResponse(err, 'RUNS_LIST_FAILED');
  }
}
