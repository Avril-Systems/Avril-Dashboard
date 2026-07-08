'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { useWaaP } from '@/src/components/WaaPProvider';
import { signInWithWallet } from '@/src/lib/establishWalletSession';
import { MarketingBrandButton } from '@/components/marketing/marketing-brand-button';

export function WalletSignInPanel() {
  const { login, refreshWalletSession } = useWaaP();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithWallet(login);
      await refreshWalletSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="avril-marketing min-h-screen grid place-items-center bg-[var(--avril-canvas)] p-6 font-sans antialiased">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/70 bg-surface/60 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-brand/30 bg-brand/10">
          <Wallet size={24} className="text-brand" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">Operator dashboard</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Sign in with your wallet and confirm a message (SIWE) to access your AI-operated company.
          </p>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <MarketingBrandButton
          label={busy ? 'Signing in…' : 'Sign in with wallet'}
          onClick={() => void handleSignIn()}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">Human.tech WaaP · wallet signature secures your session</p>
        <Link href="/" className="inline-block text-xs text-brand hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
