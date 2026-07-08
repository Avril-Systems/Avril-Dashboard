export const DEPLOYMENT_PLANS = [
  {
    id: 'blueprint',
    name: 'Blueprint',
    priceLabel: '$99',
    amountCents: 9900,
    intervalKey: 'one-time' as const,
    checkoutMode: 'payment' as const,
    recommended: false,
  },
  {
    id: 'managed-launch',
    name: 'Managed Launch',
    priceLabel: '$999',
    amountCents: 99900,
    intervalKey: 'setup' as const,
    checkoutMode: 'payment' as const,
    recommended: true,
  },
  {
    id: 'operator',
    name: 'Operator',
    priceLabel: '$199',
    amountCents: 19900,
    intervalKey: 'month' as const,
    checkoutMode: 'subscription' as const,
    recommended: false,
  },
] as const;

export type DeploymentPlanId = (typeof DEPLOYMENT_PLANS)[number]['id'];

export const DEPLOY_PLAN_INTERVAL_LABELS = {
  en: { 'one-time': 'one-time', setup: 'setup', month: 'month' },
  es: { 'one-time': 'pago único', setup: 'setup', month: 'mes' },
} as const;
