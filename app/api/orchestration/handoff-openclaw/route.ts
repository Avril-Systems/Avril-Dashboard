import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, rejectLargePayload, requireDashboardToken } from '@/src/lib/apiSecurity';
import { getChatIgnitionDraft, getDefaultOrganizationId } from '@/src/lib/convexServer';
import { runOpenClawSpawn } from '@/src/lib/runOpenClawSpawn';

type HandoffBody = {
  chatId?: string;
  organizationId?: string;
};

export async function POST(req: Request) {
  try {
    if (!requireDashboardToken(req)) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }
    const ip = getClientIp(req);
    if (hitRateLimit(`orchestration:handoff-openclaw:${ip}`, 20)) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
        { status: 429 }
      );
    }
    if (rejectLargePayload(req, 16 * 1024)) {
      return NextResponse.json(
        { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' } },
        { status: 413 }
      );
    }

    const body = (await req.json()) as HandoffBody;
    const chatId = body.chatId?.trim();
    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'chatId is required' } },
        { status: 400 }
      );
    }

    const draft = await getChatIgnitionDraft({ chatId });

    if (draft?.status === 'spawned' && draft.spawnSessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'ALREADY_SPAWNED',
            message: 'This chat already handed off to OpenClaw. Open Agent Office or start a new chat.',
          },
          existingSessionId: String(draft.spawnSessionId),
        },
        { status: 409 }
      );
    }

    if (!draft) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'DRAFT_NOT_READY',
            message: 'No ignition draft for this chat. Continue the Venice interview until handoff_ready.',
          },
        },
        { status: 400 }
      );
    }

    if (draft.status !== 'ready') {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'DRAFT_NOT_READY',
            message: `Ignition draft is "${draft.status}". Complete the founder flow until status is ready.`,
          },
        },
        { status: 400 }
      );
    }

    const prompt = draft.ignitionPrompt?.trim();
    if (!prompt) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'MISSING_IGNITION_PROMPT',
            message: 'Draft is ready but ignition prompt is empty.',
          },
        },
        { status: 400 }
      );
    }

    const organizationId = body.organizationId?.trim() || (await getDefaultOrganizationId());
    const draftCompany =
      draft && typeof draft === 'object'
        ? (() => {
            const captured =
              'captured' in draft && draft.captured && typeof draft.captured === 'object'
                ? (draft.captured as Record<string, unknown>)
                : null;
            const handoff =
              'handoffPayload' in draft &&
              draft.handoffPayload &&
              typeof draft.handoffPayload === 'object'
                ? (draft.handoffPayload as Record<string, unknown>)
                : null;
            const fromCaptured =
              (typeof captured?.companyName === 'string' && captured.companyName.trim()) ||
              (typeof captured?.rawIdea === 'string' && captured.rawIdea.trim()) ||
              '';
            const fromHandoff =
              (typeof handoff?.companyName === 'string' && handoff.companyName.trim()) || '';
            return (fromCaptured || fromHandoff).slice(0, 80) || undefined;
          })()
        : undefined;

    const result = await runOpenClawSpawn({
      organizationId,
      chatId,
      prompt,
      companyName: draftCompany,
      source: 'venice_ignition_draft',
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: result.code, message: result.message },
          ...(result.sessionId ? { sessionId: result.sessionId } : {}),
        },
        { status: result.httpStatus }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      status: 'active',
      spawnRequestId: result.spawnRequestId,
      vpsRef: result.vpsRef,
      containerRef: result.containerRef,
      handoffSource: 'venice_ignition_draft',
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
