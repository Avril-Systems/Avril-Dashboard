import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/src/lib/stripe';
import { markDeploymentIntentPaid } from '@/src/lib/convexServer';

/**
 * Stripe webhook — the authoritative record of payment.
 *
 * The success redirect only presents the result; this endpoint is what persists
 * `status = paid` on the deploymentIntent server-side, so a lost redirect (closed
 * tab, failed network) never loses the payment and never causes a double charge.
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: 'STRIPE_WEBHOOK_SECRET is not configured.' },
      { status: 500 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: 'Missing stripe-signature header.' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? `Webhook signature verification failed: ${err.message}` : 'Invalid signature' },
      { status: 400 }
    );
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const paid =
      session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (session.id && paid) {
      await markDeploymentIntentPaid({
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
      });
    }
  }

  return NextResponse.json({ received: true });
}
