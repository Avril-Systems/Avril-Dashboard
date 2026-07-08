import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { DEPLOYMENT_PLANS, type DeploymentPlanId } from '@/src/lib/billingPlans';
import {
  buildSessionCookie,
  readSession,
  refreshSessionToken,
} from '@/src/lib/sessionAuth';

type CheckoutBody = {
  planId?: DeploymentPlanId;
};

export async function GET() {
  return NextResponse.json({ ok: true, plans: DEPLOYMENT_PLANS, mode: process.env.CHECKOUT_MODE || 'mock' });
}

export async function POST(req: Request) {
  try {
    const session = readSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: { message: 'Sign in to continue.' } }, { status: 401 });
    }
    if (!session.luckIdeaId) {
      return NextResponse.json(
        { ok: false, error: { message: 'Save your company selection before checkout.' } },
        { status: 400 }
      );
    }

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

    // Mock checkout until Stripe (or similar) is wired. Session records the chosen plan.
    const token = refreshSessionToken(session, { plan: plan.id });
    if (!token) {
      return NextResponse.json({ ok: false, error: { message: 'Could not update session' } }, { status: 500 });
    }

    const res = NextResponse.json({
      ok: true,
      mode: process.env.CHECKOUT_MODE || 'mock',
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
