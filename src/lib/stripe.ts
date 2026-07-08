import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function isStripeCheckoutEnabled() {
  return (
    process.env.CHECKOUT_MODE === 'stripe' &&
    Boolean(process.env.STRIPE_SECRET_KEY?.trim())
  );
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

export function getAppOrigin(req?: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}
