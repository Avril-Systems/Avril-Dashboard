import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, rejectLargePayload, requireDashboardToken } from '@/src/lib/apiSecurity';
import {
  createChat,
  getDefaultOrganizationId,
  upsertChatIgnitionDraft,
} from '@/src/lib/convexServer';
import { runOpenClawSpawn } from '@/src/lib/runOpenClawSpawn';
import type { Opportunity } from '@/components/flows/luck/types';

type SpawnFromOpportunityBody = {
  opportunity?: Opportunity;
  ideaId?: string;
  organizationId?: string;
};

function buildIgnitionPrompt(opportunity: Opportunity): string {
  const bp = opportunity.blueprint;
  return [
    `# ${opportunity.name}`,
    '',
    `Company: ${opportunity.name}`,
    `Type: ${opportunity.type}`,
    `Idea: ${opportunity.offer}`,
    `Problem: ${opportunity.problem}`,
    `Ideal customer: ${opportunity.idealClient}`,
    `Monetization speed: ${opportunity.monetizationSpeed}`,
    `Agents: ${(opportunity.agents ?? []).join(', ')}`,
    '',
    '## Blueprint summary',
    bp.summary,
    '',
    '## Offer',
    bp.offer,
    '',
    '## Ideal customer',
    bp.idealCustomer,
    '',
    '## First steps',
    ...(bp.steps ?? []).map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Risks',
    ...(bp.risks ?? []).map((r) => `- ${r}`),
  ].join('\n');
}

export async function POST(req: Request) {
  try {
    if (!requireDashboardToken(req)) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }
    const ip = getClientIp(req);
    if (hitRateLimit(`orchestration:spawn-from-opportunity:${ip}`, 15)) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
        { status: 429 }
      );
    }
    if (rejectLargePayload(req, 64 * 1024)) {
      return NextResponse.json(
        { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' } },
        { status: 413 }
      );
    }

    const body = (await req.json()) as SpawnFromOpportunityBody;
    const opportunity = body.opportunity;
    if (!opportunity?.name?.trim() || !opportunity?.blueprint) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'opportunity with name and blueprint is required' } },
        { status: 400 }
      );
    }

    const companyName = opportunity.name.trim().slice(0, 80);
    const organizationId = body.organizationId?.trim() || (await getDefaultOrganizationId());
    const prompt = buildIgnitionPrompt(opportunity);

    const chat = await createChat({
      title: companyName,
      organizationId,
      area: 'General',
    });
    const chatId = typeof chat === 'string' ? chat : (chat as { chatId?: string })?.chatId;
    if (!chatId || typeof chatId !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'CHAT_CREATE_FAILED', message: 'Could not create chat for opportunity' } },
        { status: 502 }
      );
    }

    await upsertChatIgnitionDraft({
      organizationId,
      chatId,
      phase: 'handoff_ready',
      captured: {
        companyName,
        rawIdea: opportunity.offer || opportunity.problem || companyName,
        problem: opportunity.problem,
        targetUser: opportunity.idealClient,
        founderIdeaId: body.ideaId ?? undefined,
        opportunityId: opportunity.id,
      },
      ignitionPrompt: prompt,
      handoffPayload: {
        kind: 'form_opportunity_v1',
        companyName,
        ideaId: body.ideaId ?? null,
        opportunityId: opportunity.id,
      },
      nextStatus: 'ready',
    });

    const result = await runOpenClawSpawn({
      organizationId,
      chatId,
      prompt,
      companyName,
      source: 'form_opportunity',
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: result.code, message: result.message },
          chatId,
          ...(result.sessionId ? { sessionId: result.sessionId } : {}),
        },
        { status: result.httpStatus }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      chatId,
      companyName,
      status: 'active',
      spawnRequestId: result.spawnRequestId,
      vpsRef: result.vpsRef,
      containerRef: result.containerRef,
      handoffSource: 'form_opportunity',
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
