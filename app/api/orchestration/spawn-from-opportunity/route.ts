import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, rejectLargePayload, requireDashboardToken } from '@/src/lib/apiSecurity';
import {
  createChat,
  getDefaultOrganizationId,
  upsertChatIgnitionDraft,
} from '@/src/lib/convexServer';
import { runOpenClawSpawn } from '@/src/lib/runOpenClawSpawn';
import type { Opportunity } from '@/components/flows/luck/types';
import { isMarkdownBlueprint } from '@/components/flows/luck/types';
import { BLUEPRINT_MAX_CHARS } from '@/src/lib/blueprintUtils';

type SpawnFromOpportunityBody = {
  opportunity?: Opportunity;
  ideaId?: string;
  organizationId?: string;
  /** Product entry path — distinguishes RAG cards vs form wizard. */
  intakeSource?: 'rag_opportunity' | 'form_intake';
};

function buildIgnitionPrompt(opportunity: Opportunity): string {
  const bp = opportunity.blueprint;
  const header = [
    `# ${opportunity.name}`,
    '',
    `Company: ${opportunity.name}`,
    `Type: ${opportunity.type}`,
    `Idea: ${opportunity.offer}`,
    `Problem: ${opportunity.problem}`,
    `Ideal customer: ${opportunity.idealClient}`,
    `Monetization speed: ${opportunity.monetizationSpeed}`,
    `Agents: ${(opportunity.agents ?? []).join(', ')}`,
  ];

  if (bp && isMarkdownBlueprint(bp)) {
    const documentSection = bp.markdown.trim().slice(0, BLUEPRINT_MAX_CHARS);
    return [...header, '', '## Documento de identidad', documentSection].join('\n');
  }

  if (bp) {
    return [
      ...header,
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
      '## Agents',
      ...(bp.agents ?? []).map((a) => `- ${a}`),
      '',
      '## Risks',
      ...(bp.risks ?? []).map((r) => `- ${r}`),
      '',
      '## Deploy cost',
      bp.deployCost,
    ].join('\n');
  }

  return header.join('\n');
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
    if (rejectLargePayload(req, 256 * 1024)) {
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

    // TODO(billing): require and atomically consume the paid deploymentIntent
    // belonging to this company before creating an orchestration session.
    // See docs/CONTRATOS_INTEGRACION_FLUJOS.md.
    const companyName = opportunity.name.trim().slice(0, 80);
    const organizationId = body.organizationId?.trim() || (await getDefaultOrganizationId());
    const prompt = buildIgnitionPrompt(opportunity);
    const intakeSource = body.intakeSource === 'form_intake' ? 'form_intake' : 'rag_opportunity';
    const handoffKind = intakeSource === 'form_intake' ? 'form_intake_v1' : 'rag_opportunity_v1';

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
        intakeSource,
      },
      ignitionPrompt: prompt,
      handoffPayload: {
        kind: handoffKind,
        companyName,
        ideaId: body.ideaId ?? null,
        opportunityId: opportunity.id,
        intakeSource,
      },
      nextStatus: 'ready',
    });

    const result = await runOpenClawSpawn({
      organizationId,
      chatId,
      prompt,
      companyName,
      source: intakeSource,
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
      handoffSource: intakeSource,
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
