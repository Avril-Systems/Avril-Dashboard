export const DEPLOYMENT_PLANS = [
  {
    id: 'managed',
    name: 'Managed Cloud',
    priceLabel: '$99',
    interval: 'month',
    description: 'Your agent team runs on Avril-managed infrastructure. Best for shipping fast.',
    features: ['Private workspace', 'OpenClaw deployment', 'Agent office access', 'Email support'],
    recommended: true,
  },
  {
    id: 'dedicated',
    name: 'Dedicated Instance',
    priceLabel: '$299',
    interval: 'month',
    description: 'Isolated compute and stricter guardrails for teams with compliance needs.',
    features: ['Dedicated tenant', 'Custom agent roles', 'Priority orchestration', 'SLA support'],
    recommended: false,
  },
] as const;

export type DeploymentPlanId = (typeof DEPLOYMENT_PLANS)[number]['id'];
