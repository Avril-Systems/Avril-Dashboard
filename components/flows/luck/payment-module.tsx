'use client';

import { useState } from 'react';
import { Check, CreditCard } from 'lucide-react';
import { DEPLOYMENT_PLANS, type DeploymentPlanId } from '@/src/lib/billingPlans';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { cn } from '@/lib/utils';

type PaymentModuleProps = {
  companyName: string;
  ideaId?: string;
  onComplete: () => void;
};

export function PaymentModule({ companyName, ideaId, onComplete }: PaymentModuleProps) {
  const [selectedPlan, setSelectedPlan] = useState<DeploymentPlanId>('managed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: { message?: string }; checkoutUrl?: string | null };
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Checkout failed');
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Deploy & billing</p>
        <h2 className="text-2xl font-semibold md:text-3xl">Launch {companyName}</h2>
        <p className="text-sm text-muted-foreground">
          Choose a deployment plan to activate your agent team. Payment is mocked until Stripe is connected.
        </p>
        {ideaId && (
          <p className="font-mono text-[11px] text-muted-foreground/80">Linked idea · {ideaId.slice(0, 12)}…</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DEPLOYMENT_PLANS.map((plan) => {
          const active = selectedPlan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
              className={cn(
                'relative rounded-2xl border p-5 text-left transition-colors',
                active
                  ? 'border-brand/60 bg-brand/10 shadow-[0_0_32px_rgba(0,153,175,0.15)]'
                  : 'border-border/70 bg-surface/40 hover:border-border'
              )}
            >
              {plan.recommended && (
                <span className="absolute right-3 top-3 rounded-full border border-brand/40 bg-brand/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-brand">
                  Popular
                </span>
              )}
              <p className="text-sm font-semibold text-foreground">{plan.name}</p>
              <p className="mt-1 text-2xl font-semibold text-brand">
                {plan.priceLabel}
                <span className="text-sm font-normal text-muted-foreground"> / {plan.interval}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
              <ul className="mt-4 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs text-foreground/85">
                    <Check size={12} className="shrink-0 text-brand" />
                    {feature}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {error && <p className="text-center text-sm text-rose-400">{error}</p>}

      <div className="flex flex-col items-center gap-3">
        <MarketingBrandButton
          label={loading ? 'Processing…' : 'Confirm & launch'}
          onClick={() => void handleCheckout()}
        />
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CreditCard size={12} />
          Mock checkout · set CHECKOUT_MODE=stripe when ready
        </p>
      </div>
    </div>
  );
}
