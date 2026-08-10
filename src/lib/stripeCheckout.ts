import type Stripe from 'stripe';
import { DEPLOYMENT_PLANS, type DeploymentPlanId } from '@/src/lib/billingPlans';
import { getStripe } from '@/src/lib/stripe';

type CreateCheckoutSessionInput = {
  planId: DeploymentPlanId;
  companyName: string;
  flowSource: string;
  origin: string;
  ideaId?: string;
  /** RAG opportunity uuid (used by Launch POST /iniciar/{uuid}). */
  opportunityId?: string;
  customerEmail?: string;
};

export async function createStripeCheckoutSession(input: CreateCheckoutSessionInput) {
  const plan = DEPLOYMENT_PLANS.find((entry) => entry.id === input.planId);
  if (!plan) {
    throw new Error('Invalid plan.');
  }

  const stripe = getStripe();
  const productName = `${plan.name} — ${input.companyName}`;
  const cancelUrl = new URL('/billing/cancel', input.origin);
  cancelUrl.searchParams.set('company', input.companyName);
  cancelUrl.searchParams.set('flow', input.flowSource);

  const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
    currency: 'usd',
    product_data: {
      name: productName,
      metadata: {
        planId: plan.id,
        companyName: input.companyName,
        flowSource: input.flowSource,
      },
    },
    unit_amount: plan.amountCents,
  };

  if (plan.checkoutMode === 'subscription') {
    priceData.recurring = { interval: 'month' };
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: plan.checkoutMode,
    line_items: [{ price_data: priceData, quantity: 1 }],
    success_url: `${input.origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl.toString(),
    metadata: {
      planId: plan.id,
      companyName: input.companyName,
      flowSource: input.flowSource,
      ideaId: input.ideaId ?? '',
      opportunityId: input.opportunityId ?? '',
    },
    allow_promotion_codes: true,
  };

  if (input.customerEmail) {
    sessionParams.customer_email = input.customerEmail;
  }

  return stripe.checkout.sessions.create(sessionParams);
}

export async function verifyStripeCheckoutSession(sessionId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const paid =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required' ||
    (session.mode === 'subscription' && session.status === 'complete');

  return {
    paid,
    session,
    companyName: session.metadata?.companyName ?? '',
    planId: (session.metadata?.planId ?? '') as DeploymentPlanId | '',
    flowSource: session.metadata?.flowSource ?? 'marketing',
    ideaId: session.metadata?.ideaId ?? '',
    opportunityId: session.metadata?.opportunityId ?? '',
  };
}
