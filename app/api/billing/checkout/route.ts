import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { DEPLOYMENT_PLANS, type DeploymentPlanId } from '@/src/lib/billingPlans';
import {
  buildSessionCookie,
  readSession,
  refreshSessionToken,
} from '@/src/lib/sessionAuth';
import { createStripeCheckoutSession } from '@/src/lib/stripeCheckout';
import { getAppOrigin, isStripeCheckoutEnabled } from '@/src/lib/stripe';

type CheckoutBody = {
  planId?: DeploymentPlanId;
  companyName?: string;
  flowSource?: string;
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

    if (!session.luckIdeaId) {
      return NextResponse.json(
        { ok: false, error: { message: 'Save your company selection before checkout.' } },
        { status: 400 }
      );
    }

    const origin = getAppOrigin(req);

    if (isStripeCheckoutEnabled()) {
      const checkoutSession = await createStripeCheckoutSession({
        planId: plan.id,
        companyName,
        flowSource,
        origin,
        ideaId: session.luckIdeaId,
      });

      const token = refreshSessionToken(session, { plan: plan.id });
      if (!token) {
        return NextResponse.json({ ok: false, error: { message: 'Could not update session' } }, { status: 500 });
      }

      const response = NextResponse.json({
        ok: true,
        mode: 'stripe',
        planId: plan.id,
        companyName,
        flowSource,
        ideaId: session.luckIdeaId,
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
      });
      response.headers.append('Set-Cookie', buildSessionCookie(token));
      return response;
    }

    const token = refreshSessionToken(session, { plan: plan.id });
    if (!token) {
      return NextResponse.json({ ok: false, error: { message: 'Could not update session' } }, { status: 500 });
    }

    const res = NextResponse.json({
      ok: true,
      mode: 'mock',
      planId: plan.id,
      ideaId: session.luckIdeaId,
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
