'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { useWaaP } from '@/src/components/WaaPProvider';
import { signInWithWallet } from '@/src/lib/establishWalletSession';
import { clearPersistedLuckSelection, persistLuckSelection } from '@/src/lib/luckIntake';
import { useLanguage } from '@/components/marketing/language-context';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';
import { PaymentModule } from './payment-module';
import type { Opportunity } from './types';

type GatePhase = 'sign-in' | 'linking' | 'payment';

type DeployGateProps = {
  opportunity: Opportunity;
  flowSource: 'opportunity' | 'idea';
  onRestart: () => void;
  onComplete: (ideaId: string) => void;
};

export function DeployGate({ opportunity, flowSource, onRestart, onComplete }: DeployGateProps) {
  const { t } = useLanguage();
  const s = t.flow.signIn;
  const { isReady, login, refreshWalletSession } = useWaaP();
  const [phase, setPhase] = useState<GatePhase>('sign-in');
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveSelection = useCallback(async () => {
    const res = await fetch('/api/founder/luck-intake', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      ideaId?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.ok || !data.ideaId) {
      throw new Error(data.error?.message || 'Could not link your selection to your account.');
    }
    setIdeaId(data.ideaId);
    return data.ideaId;
  }, [opportunity]);

  const resumeFromSession = useCallback(async () => {
    const session = await refreshWalletSession();
    if (!session) {
      setPhase('sign-in');
      return;
    }

    if (session.luckIdeaId) {
      setIdeaId(session.luckIdeaId);
      if (session.plan) {
        onComplete(session.luckIdeaId);
      } else {
        setPhase('payment');
      }
      return;
    }

    setPhase('linking');
    try {
      await saveSelection();
      setPhase('payment');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save selection');
      setPhase('sign-in');
    }
  }, [saveSelection, onComplete, refreshWalletSession]);

  useEffect(() => {
    persistLuckSelection(opportunity);
  }, [opportunity]);

  useEffect(() => {
    if (!isReady) return;
    void resumeFromSession();
  }, [isReady, resumeFromSession]);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithWallet(login);
      await refreshWalletSession();

      setPhase('linking');
      await saveSelection();
      setPhase('payment');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setPhase('sign-in');
    } finally {
      setBusy(false);
    }
  }

  function handlePaymentComplete() {
    clearPersistedLuckSelection();
    if (ideaId) {
      onComplete(ideaId);
    }
  }

  const linkingText = s.linking.replace('{company}', opportunity.name);
  const restartLabel = flowSource === 'idea' ? s.restartIdea : s.restartOpportunity;

  if (phase === 'linking') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-muted-foreground">{linkingText}</p>
      </div>
    );
  }

  if (phase === 'payment') {
    return (
      <PaymentModule
        companyName={opportunity.name}
        flowSource={flowSource}
        ideaId={ideaId ?? undefined}
        onComplete={handlePaymentComplete}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-2xl text-brand">
        <Wallet size={28} className="text-brand" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl md:text-3xl">{s.title}</h2>
        <p className="text-sm font-medium text-brand">{opportunity.name}</p>
        <p className="text-muted-foreground">{s.subtitle}</p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex flex-col items-center gap-3">
        <MarketingBrandButton
          label={busy ? s.connecting : s.cta}
          onClick={() => void handleSignIn()}
          disabled={busy}
        />
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wallet size={12} />
          {s.walletNote}
        </p>
      </div>

      <button type="button" onClick={onRestart} className="text-sm text-brand hover:underline">
        {restartLabel}
      </button>
    </div>
  );
}
