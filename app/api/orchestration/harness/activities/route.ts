import { NextResponse } from 'next/server';
import { rejectLargePayload } from '@/src/lib/apiSecurity';
import { isHarnessType } from '@/convex/lib/harnessActivities';
import type { HarnessType } from '@/convex/lib/harnessActivities';
import { HarnessInputError, normalizeActivityInput } from '@/src/lib/harnessInput';
import { assignHarnessActivity, errorResponse, guardRequest, isSafeId, listTenantActivities } from '@/src/lib/swarmyServer';
import type { HarnessActivityRow } from '@/src/lib/swarmyServer';

const STATUSES: HarnessActivityRow['status'][] = ['queued', 'running', 'completed', 'failed', 'blocked', 'cancelled'];

/**
 * GET  /api/orchestration/harness/activities
 *      ?runId=&harnessType=&status=&includeResult=true&limit=
 * POST /api/orchestration/harness/activities
 *      { harnessType, activity, title?, input? }
 *
 * El tenant/workspace SIEMPRE salen de la configuración del servidor
 * (SWARMY_TENANT_ID / SWARMY_WORKSPACE_ID); el cliente no los elige.
 */
export async function GET(req: Request) {
  const denied = guardRequest(req, 'activities', 180);
  if (denied) return denied;
  try {
    const params = new URL(req.url).searchParams;
    const runId = params.get('runId')?.trim() || undefined;
    const harnessType = params.get('harnessType')?.trim() || undefined;
    const status = params.get('status')?.trim() || undefined;
    const includeResult = params.get('includeResult') === 'true';
    const limitRaw = Number(params.get('limit') ?? '50');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

    if (runId && !isSafeId(runId)) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'runId inválido' } }, { status: 400 });
    }
    if (harnessType && !isHarnessType(harnessType)) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'harnessType inválido' } }, { status: 400 });
    }
    if (status && !STATUSES.includes(status as HarnessActivityRow['status'])) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'status inválido' } }, { status: 400 });
    }

    const activities = await listTenantActivities({
      runId,
      harnessType,
      status: status as HarnessActivityRow['status'] | undefined,
      includeResult,
      limit,
    });
    return NextResponse.json({ ok: true, activities });
  } catch (err) {
    return errorResponse(err, 'ACTIVITIES_LIST_FAILED');
  }
}

type AssignBody = {
  harnessType?: unknown;
  activity?: unknown;
  title?: unknown;
  input?: unknown;
};

export async function POST(req: Request) {
  const denied = guardRequest(req, 'activities:assign', 30);
  if (denied) return denied;
  if (rejectLargePayload(req, 16 * 1024)) {
    return NextResponse.json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload demasiado grande' } }, { status: 413 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as AssignBody;
    const normalized = normalizeActivityInput(body.harnessType, body.activity, body.input);
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : undefined;

    const assigned = await assignHarnessActivity({
      harnessType: normalized.harnessType as HarnessType,
      activity: body.activity as string,
      title: title || undefined,
      input: normalized.input,
      createdBy: 'dashboard',
    });

    return NextResponse.json({ ok: true, ...assigned }, { status: 201 });
  } catch (err) {
    if (err instanceof HarnessInputError) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_INPUT', message: err.message } }, { status: 400 });
    }
    return errorResponse(err, 'ACTIVITY_ASSIGN_FAILED');
  }
}
