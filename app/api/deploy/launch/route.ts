import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { readSession } from '@/src/lib/sessionAuth';
import { verifyStripeCheckoutSession } from '@/src/lib/stripeCheckout';
import { isStripeCheckoutEnabled } from '@/src/lib/stripe';
import {
  startCompanyDeploy,
  LaunchServiceError,
  mapLaunchStatusToSessionStatus,
} from '@/src/lib/launchClient';
import {
  appendOrchestrationEvent,
  createChat,
  createOrchestrationSession,
  upsertOrchestrationAgents,
} from '@/src/lib/convexServer';
import { buildSwarmAgentsForPrompt } from '@/src/lib/orchestrationSwarmGuardrails';

type DeployLaunchBody = {
  /** Stripe Checkout session id. The Launch call only runs when this session is paid. */
  session_id?: string;
  /** RAG opportunity uuid (from Stripe metadata via verify, or supplied directly in the body). */
  opportunityId?: string;
};

const ERROR_STATUS: Record<string, number> = {
  STRIPE_NOT_ENABLED: 400,
  PAYMENT_NOT_PAID: 402,
  OPPORTUNITY_ID_MISSING: 400,
  LAUNCH_DISABLED: 501,
  CONFIG_ERROR: 501,
  LAUNCH_UPSTREAM_ERROR: 502,
  LAUNCH_TIMEOUT: 502,
  LAUNCH_CONNECTION_ERROR: 502,
  IDEA_NO_DISPONIBLE: 409,
  LAUNCH_CONFLICT: 409,
};

export async function POST(req: Request) {
  try {
    const session = readSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in with your wallet to continue.' } },
        { status: 401 }
      );
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`deploy:launch:${ip}`, 15)) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
        { status: 429 }
      );
    }

    const body = (await req.json()) as DeployLaunchBody;
    const stripeSessionId = body.session_id?.trim();
    if (!stripeSessionId) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'session_id is required.' } },
        { status: 400 }
      );
    }

    if (!isStripeCheckoutEnabled()) {
      return NextResponse.json(
        { ok: false, error: { code: 'STRIPE_NOT_ENABLED', message: 'Stripe checkout is not enabled.' } },
        { status: 400 }
      );
    }

    const verified = await verifyStripeCheckoutSession(stripeSessionId);
    if (!verified.paid) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'PAYMENT_NOT_PAID', message: 'Payment is not verified as paid.' },
        },
        { status: 402 }
      );
    }

    const opportunityId = verified.opportunityId || body.opportunityId?.trim();
    if (!opportunityId) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'OPPORTUNITY_ID_MISSING', message: 'No RAG opportunity uuid found for this payment.' },
        },
        { status: 400 }
      );
    }

    const result = await startCompanyDeploy(opportunityId);
    const companyName = verified.companyName;

    // Adapter (compatibilidad temporal, ver CONTRATOS_INTEGRACION_FLUJOS.md):
    // Launch provisiona y corre el runtime, pero NO toca Convex. El dashboard crea
    // la sesión de orquestación que Agent Office visualiza y la enlaza al deploy.
    let orchestrationSessionId: string | null = null;
    try {
      const chat = await createChat({ title: companyName || 'Untitled company', area: 'General' });
      const chatId = typeof chat === 'string' ? chat : (chat as { chatId?: string })?.chatId;
      if (chatId && typeof chatId === 'string') {
        const newSessionId = await createOrchestrationSession({
          chatId,
          companyName: companyName || undefined,
          status: mapLaunchStatusToSessionStatus(result.status),
          spawnRequestId: result.deploymentId ?? undefined,
          containerRef: result.companyId ? `oc-${result.companyId}` : undefined,
        });
        if (newSessionId) {
          orchestrationSessionId = newSessionId;
          await appendOrchestrationEvent({
            sessionId: newSessionId,
            type: 'deploy.created',
            payload: {
              deploymentId: result.deploymentId,
              companyId: result.companyId,
              status: result.status,
              alreadyExisted: result.alreadyExisted,
            },
          });

          try {
            await upsertOrchestrationAgents({
              sessionId: newSessionId,
              agents: buildSwarmAgentsForPrompt(undefined),
            });
          } catch {
            /* seeding agents is best-effort */
          }
        }
      }
    } catch {
      // Convex adapter failure is not fatal: Launch already accepted the deploy.
      // Future deploymentIntents will make session creation atomic with the intent.
    }

    return NextResponse.json({
      ok: true,
      companyId: result.companyId,
      status: mapLaunchStatusToSessionStatus(result.status),
      deploymentId: result.deploymentId,
      orchestrationSessionId,
      alreadyExisted: result.alreadyExisted,
      companyName,
      planId: verified.planId,
    });
  } catch (err) {
    if (err instanceof LaunchServiceError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
            retryable: err.retryable,
            ...(err.code === 'IDEA_NO_DISPONIBLE' ? { action: 'elegir_nueva_idea' } : {}),
          },
        },
        { status: ERROR_STATUS[err.code] ?? 500 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      },
      { status: 500 }
    );
  }
}
