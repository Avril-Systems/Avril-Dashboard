import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { DEPLOYMENT_PLANS, type DeploymentPlanId } from '@/src/lib/billingPlans';
import {
  buildSessionCookie,
  readSession,
  refreshSessionToken,
} from '@/src/lib/sessionAuth';
import { createStripeCheckoutSession } from '@/src/lib/stripeCheckout';
import { getAppOrigin, getStripe, isStripeCheckoutEnabled } from '@/src/lib/stripe';
import {
  attachCheckoutSession,
  cancelDeploymentIntent,
  createDeploymentIntent,
  getDeploymentIntentByOpportunity,
} from '@/src/lib/convexServer';

type CheckoutBody = {
  planId?: DeploymentPlanId;
  companyName?: string;
  flowSource?: string;
  ideaId?: string;
  opportunityId?: string;
  deploymentIntentId?: string;
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    plans: DEPLOYMENT_PLANS,
    mode: isStripeCheckoutEnabled() ? 'stripe' : 'mock',
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  });
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (hitRateLimit(`billing:checkout:${ip}`, 15)) {
      return NextResponse.json({ ok: false, error: { message: 'Rate limit exceeded' } }, { status: 429 });
    }

    const body = (await req.json()) as CheckoutBody;
    const planId = body.planId;
    const plan = DEPLOYMENT_PLANS.find((p) => p.id === planId);
    if (!plan) {
      return NextResponse.json({ ok: false, error: { message: 'Invalid plan.' } }, { status: 400 });
    }

    const companyName = body.companyName?.trim();
    if (!companyName) {
      return NextResponse.json({ ok: false, error: { message: 'Company name is required.' } }, { status: 400 });
    }

    const flowSource = body.flowSource?.trim() || 'marketing';
    const session = readSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: { message: 'Sign in with your wallet to continue.' } },
        { status: 401 }
      );
    }

    if (!session.luckIdeaId && !body.ideaId?.trim()) {
      return NextResponse.json(
        { ok: false, error: { message: 'Save your company selection before checkout.' } },
        { status: 400 }
      );
    }

    // The idea the checkout will pay for: explicit body value or the cookie link.
    const linkedIdeaId = body.ideaId?.trim() || session.luckIdeaId!;

    const origin = getAppOrigin(req);

    // One company = one deploy = one checkout. The deploymentIntent is the
    // server-side record that this checkout will pay for this company; it also
    // becomes the Stripe idempotency key so a double-click never creates two
    // chargeable sessions. Degrades to null when Convex is unavailable (dev).
    let deploymentIntentId: string | undefined;

    // Already paid? If this wallet already paid for this RAG opportunity, DO NOT
    // create a new chargeable checkout — reuse the paid session instead. The Stripe
    // idempotency key would otherwise return the SAME (possibly expired) session URL,
    // landing the user on Stripe's terminal "All set here" page forever. The intent's
    // Convex status is NOT authoritative here: a paid session may still be recorded
    // as `checkout_pending` when the webhook didn't fire, so we always check Stripe.
    const opportunityId = body.opportunityId?.trim();
    if (opportunityId) {
      try {
        const existingIntent = await getDeploymentIntentByOpportunity({
          opportunityId,
          founderWallet: session.address,
        });
        if (existingIntent?.stripeCheckoutSessionId) {
          const session = await getStripe().checkout.sessions.retrieve(
            existingIntent.stripeCheckoutSessionId
          );
          const isPaid =
            session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
          if (isPaid) {
            return NextResponse.json({
              ok: true,
              mode: 'stripe',
              planId: plan.id,
              companyName,
              flowSource,
              ideaId: linkedIdeaId,
              alreadyPaid: true,
              sessionId: existingIntent.stripeCheckoutSessionId,
              checkoutUrl: null,
            });
          }
          // Not paid and terminal (expired): the dedup in createDeploymentIntent would
          // hand us the SAME intent id, and the Stripe idempotency key would then return
          // the SAME (expired) session URL forever. Supersede it so a fresh chargeable
          // checkout is issued.
          if (session.status === 'expired') {
            await cancelDeploymentIntent({ intentId: existingIntent._id }).catch(() => null);
          }
        }
      } catch {
        /* Convex unavailable → fall through to a normal checkout */
      }
    }

    try {
      deploymentIntentId =
        body.deploymentIntentId?.trim() ||
        ((await createDeploymentIntent({
          source: flowSource === 'form_intake' ? 'form_intake' : 'rag_opportunity',
          companyName,
          opportunityId,
          founderWallet: session.address,
          planId: plan.id,
        })) as string);
    } catch {
      deploymentIntentId = undefined;
    }

    if (isStripeCheckoutEnabled()) {
      const checkoutSession = await createStripeCheckoutSession({
        planId: plan.id,
        companyName,
        flowSource,
        origin,
        ideaId: linkedIdeaId,
        opportunityId: body.opportunityId?.trim(),
        deploymentIntentId,
      });

      if (deploymentIntentId && checkoutSession.id) {
        try {
          await attachCheckoutSession({
            intentId: deploymentIntentId,
            stripeCheckoutSessionId: checkoutSession.id,
            planId: plan.id,
          });
        } catch {
          /* webhook will reconcile via metadata/client_reference_id if attach failed */
        }
      }

      const token = refreshSessionToken(session, { plan: plan.id, luckIdeaId: linkedIdeaId });
      if (!token) {
        return NextResponse.json({ ok: false, error: { message: 'Could not update session' } }, { status: 500 });
      }

      const response = NextResponse.json({
        ok: true,
        mode: 'stripe',
        planId: plan.id,
        companyName,
        flowSource,
        ideaId: linkedIdeaId,
        deploymentIntentId,
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
      });
      response.headers.append('Set-Cookie', buildSessionCookie(token));
      return response;
    }

    const token = refreshSessionToken(session, { plan: plan.id, luckIdeaId: linkedIdeaId });
    if (!token) {
      return NextResponse.json({ ok: false, error: { message: 'Could not update session' } }, { status: 500 });
    }

    const res = NextResponse.json({
      ok: true,
      mode: 'mock',
      planId: plan.id,
      ideaId: linkedIdeaId,
      deploymentIntentId,
      checkoutUrl: null,
    });
    res.headers.append('Set-Cookie', buildSessionCookie(token));
    return res;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { message: err instanceof Error ? err.message : 'Checkout failed' } },
      { status: 500 }
    );
  }
}
