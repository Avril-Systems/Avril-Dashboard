'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CreditCard, RefreshCcw } from 'lucide-react';
import {
  DEPLOYMENT_PLANS,
  DEPLOY_PLAN_INTERVAL_LABELS,
  type DeploymentPlanId,
} from '@/src/lib/billingPlans';
import { useLanguage } from '@/components/marketing/language-context';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { cn } from '@/lib/utils';
import { clearRedeemCheckout, readRedeemCheckout, updateRedeemCheckout, writeRedeemCheckout } from '@/src/lib/checkoutRedeem';

type RecoverableIntent = {
  _id: string;
  companyName?: string;
  planId?: string | null;
  stripeCheckoutSessionId?: string | null;
  paidAt?: string | null;
};

type PaymentModuleProps = {
  companyName: string;
  flowSource?: 'opportunity' | 'idea';
  ideaId?: string;
  opportunityId?: string;
  onComplete: () => void;
};

export function PaymentModule({
  companyName,
  flowSource = 'opportunity',
  ideaId,
  opportunityId,
  onComplete,
}: PaymentModuleProps) {
  const { t, language } = useLanguage();
  const d = t.flow.deploy;
  const [selectedPlan, setSelectedPlan] = useState<DeploymentPlanId>('managed-launch');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeem, setRedeem] = useState(() => readRedeemCheckout());
  const [recoverable, setRecoverable] = useState<RecoverableIntent[]>([]);

  // When a paid session is being reused, the plan is locked to the one already paid
  // for. The reused checkout never charges again, so picking a different plan would be
  // misleading (and a higher plan needs a brand-new payment, not this session).
  const lockedPlanId =
    redeem?.planId && DEPLOYMENT_PLANS.some((p) => p.id === redeem.planId)
      ? (redeem.planId as DeploymentPlanId)
      : null;
  const activePlanId = lockedPlanId ?? selectedPlan;

  useEffect(() => {
    // Refresh the redeem credit when the user lands here after picking another idea.
    setRedeem(readRedeemCheckout());
  }, [companyName, opportunityId]);

  useEffect(() => {
    // Recovery: the user may have paid earlier but lost the tab/browser before the
    // deploy succeeded. The server-side intent still knows the session is paid, so
    // offer to reuse it (no new charge) instead of silently charging again.
    if (redeem || !opportunityId) return;
    let cancelled = false;
    fetch('/api/billing/intents', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list: RecoverableIntent[] = Array.isArray(data?.intents) ? data.intents : [];
        setRecoverable(list.filter((i) => i.stripeCheckoutSessionId));
      })
      .catch(() => {
        if (!cancelled) setRecoverable([]);
      });
    return () => {
      cancelled = true;
    };
  }, [redeem, opportunityId]);

  async function isRedeemSessionPaid(sessionId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/billing/verify?session_id=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean; paid?: boolean };
      return Boolean(data.ok && data.paid);
    } catch {
      return false;
    }
  }

  function reuseRecoverable(intent: RecoverableIntent) {
    const sessionId = intent.stripeCheckoutSessionId;
    if (!sessionId) return;
    void (async () => {
      setLoading(true);
      setError(null);
      const stillPaid = await isRedeemSessionPaid(sessionId);
      if (!stillPaid) {
        clearRedeemCheckout();
        setRedeem(null);
        setRecoverable([]);
        setError(
          language === 'es'
            ? 'Ese pago ya no es válido (expiró o fue reembolsado). Realiza un nuevo checkout.'
            : 'That payment is no longer valid (expired or refunded). Please start a new checkout.'
        );
        setLoading(false);
        return;
      }
      writeRedeemCheckout({
        sessionId,
        planId: intent.planId || selectedPlan,
        opportunityId,
        companyName,
      });
      setLoading(false);
      window.location.href = `/billing/success?session_id=${encodeURIComponent(sessionId)}`;
    })();
  }

  const stripeEnabled = process.env.NEXT_PUBLIC_CHECKOUT_MODE === 'stripe';
  const intervalLabels = DEPLOY_PLAN_INTERVAL_LABELS[language];
  const footerNote = useMemo(
    () => (stripeEnabled ? d.stripeNote : d.mockNote),
    [stripeEnabled, d.mockNote, d.stripeNote]
  );

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    if (redeem && opportunityId) {
      // Opción R: the user already paid for a deploy whose idea hit a 409. Reuse the
      // SAME paid Stripe session for this new idea — no new checkout, no new charge.
      try {
        // Guard: a stale redeem credit (e.g. an expired/unpaid Stripe session from an
        // earlier attempt) must not be reused — it would fail verification downstream.
        const stillPaid = await isRedeemSessionPaid(redeem.sessionId);
        if (!stillPaid) {
          clearRedeemCheckout();
          setRedeem(null);
          throw new Error(
            language === 'es'
              ? 'Tu pago anterior expiró o ya no es válido. Realiza un nuevo checkout.'
              : 'Your previous payment expired or is no longer valid. Please start a new checkout.'
          );
        }
        updateRedeemCheckout({ opportunityId, companyName });
        window.location.href = `/billing/success?session_id=${encodeURIComponent(redeem.sessionId)}`;
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reuse payment');
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: activePlanId,
          companyName,
          flowSource,
          ideaId,
          opportunityId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: { message?: string };
        checkoutUrl?: string | null;
        alreadyPaid?: boolean;
        sessionId?: string | null;
        mode?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Checkout failed');
      }

      // Already paid for this opportunity: go straight to the success/recovery page
      // instead of opening (or re-opening) a terminal Stripe checkout URL.
      if (data.alreadyPaid && data.sessionId) {
        window.location.href = `/billing/success?session_id=${encodeURIComponent(data.sessionId)}`;
        return;
      }

      if (data.checkoutUrl) {
        sessionStorage.removeItem('avril_checkout_pending');
        sessionStorage.setItem(
          'avril_checkout_pending',
          JSON.stringify({ companyName, flowSource, planId: selectedPlan })
        );
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
        <p className="font-heading text-xs font-medium uppercase tracking-[0.14em] text-brand">{d.eyebrow}</p>
        <h2 className="text-2xl md:text-3xl">
          {d.title} {companyName}
        </h2>
        <p className="text-sm text-muted-foreground">{stripeEnabled ? d.stripeSubtitle : d.subtitle}</p>
        {ideaId && (
          <p className="font-mono text-[11px] text-muted-foreground/80">Linked idea · {ideaId.slice(0, 12)}…</p>
        )}
      </div>

      {redeem && opportunityId && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-center text-sm text-brand">
          <RefreshCcw size={14} className="shrink-0" />
          <span>
            {language === 'es'
              ? 'Usando tu pago ya procesado — no se te cobrará de nuevo por esta oportunidad.'
              : 'Using your processed payment — you will not be charged again for this opportunity.'}
          </span>
        </div>
      )}

      {!redeem && recoverable.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-200">
            {language === 'es'
              ? 'Tienes un pago procesado que puedes reutilizar:'
              : 'You have a processed payment you can reuse:'}
          </p>
          {recoverable.map((intent) => (
            <div key={intent._id} className="flex flex-col items-center justify-between gap-2 sm:flex-row">
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground/90">
                  {language === 'es' ? 'Pago procesado' : 'Processed payment'}
                </p>
                {intent.paidAt && (
                  <p>
                    {language === 'es' ? 'Pagado el ' : 'Paid on '}
                    {new Date(intent.paidAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => reuseRecoverable(intent)}
                className="rounded-lg border border-brand/50 bg-brand/15 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/25"
              >
                {language === 'es' ? 'Reutilizar este pago' : 'Reuse this payment'}
              </button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {language === 'es'
              ? 'Se aplicará a esta oportunidad sin cobrarte de nuevo.'
              : 'It will be applied to this opportunity without charging you again.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        {DEPLOYMENT_PLANS.map((plan) => {
          const active = activePlanId === plan.id;
          const locked = Boolean(lockedPlanId);
          const planCopy = d.plans[plan.id];
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => {
                if (locked) return;
                setSelectedPlan(plan.id);
              }}
              disabled={locked && !active}
              aria-pressed={active}
              className={cn(
                'relative rounded-2xl border p-5 text-left transition-colors',
                active
                  ? 'border-brand/60 bg-brand/10 shadow-[0_0_32px_rgba(0,153,175,0.15)]'
                  : locked
                    ? 'cursor-not-allowed border-border/50 bg-surface/20 opacity-50'
                    : 'border-border/70 bg-surface/40 hover:border-border'
              )}
            >
              {plan.recommended && (
                <span className="absolute right-3 top-3 rounded-full border border-brand/40 bg-brand/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-brand">
                  {d.popular}
                </span>
              )}
              <p className="font-heading text-sm font-semibold text-foreground">{plan.name}</p>
              <p className="avril-stat-value mt-1 text-2xl text-brand">
                {plan.priceLabel}
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}
                  / {intervalLabels[plan.intervalKey]}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{planCopy.description}</p>
              <ul className="mt-4 space-y-1.5">
                {planCopy.features.map((feature) => (
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

      {lockedPlanId && (
        <p className="text-center text-xs text-muted-foreground">
          {language === 'es'
            ? `Estás reutilizando el pago del plan ${lockedPlanId} — otro plan requiere un nuevo pago.`
            : `You are reusing the ${lockedPlanId} plan payment — another plan requires a new payment.`}
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <MarketingBrandButton
          label={loading ? d.processing : lockedPlanId ? (language === 'es' ? 'Usar mi pago' : 'Use my payment') : d.cta}
          onClick={() => void handleCheckout()}
          disabled={loading}
        />
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CreditCard size={12} />
          {footerNote}
        </p>
      </div>
    </div>
  );
}
