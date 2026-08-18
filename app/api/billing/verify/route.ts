import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { verifyStripeCheckoutSession } from '@/src/lib/stripeCheckout';
import { isStripeCheckoutEnabled } from '@/src/lib/stripe';
import { markDeploymentIntentPaid } from '@/src/lib/convexServer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id')?.trim();

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: { message: 'session_id is required.' } }, { status: 400 });
    }

    if (!isStripeCheckoutEnabled()) {
      return NextResponse.json({ ok: false, error: { message: 'Stripe checkout is not enabled.' } }, { status: 400 });
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`billing:verify:${ip}`, 30)) {
      return NextResponse.json({ ok: false, error: { message: 'Rate limit exceeded' } }, { status: 429 });
    }

    const result = await verifyStripeCheckoutSession(sessionId);

    // Reconcile server-side: the webhook is the primary path that flips the
    // deploymentIntent to `paid`, but it may not have fired (e.g. `stripe listen`
    // not running in dev). Verifying here is the authoritative fallback so a paid
    // session is ALWAYS recorded as paid — otherwise the recovery/redeem flow
    // (which only lists `paid` intents) never sees it and the user is at risk of
    // being charged again. Idempotent and best-effort.
    if (result.paid) {
      await markDeploymentIntentPaid({
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId:
          typeof result.session.payment_intent === 'string' ? result.session.payment_intent : undefined,
      }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      paid: result.paid,
      companyName: result.companyName,
      planId: result.planId,
      flowSource: result.flowSource,
      ideaId: result.ideaId || null,
      opportunityId: result.opportunityId || null,
      mode: result.session.mode,
      paymentStatus: result.session.payment_status,
      customerEmail: result.session.customer_details?.email ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { message: err instanceof Error ? err.message : 'Verification failed' } },
      { status: 500 }
    );
  }
}
