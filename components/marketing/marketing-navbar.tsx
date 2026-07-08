'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LanguageToggle } from './language-toggle';
import { useLanguage } from './language-context';
import { MarketingBrandButton } from './marketing-brand-button';
import { useWaaP } from '@/src/components/WaaPProvider';
import { signInWithWallet } from '@/src/lib/establishWalletSession';

export function MarketingNavbar() {
  const router = useRouter();
  const { t } = useLanguage();
  const { login, refreshWalletSession } = useWaaP();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      await signInWithWallet(login);
      await refreshWalletSession();
      router.push('/agents/office');
    } catch {
      // User dismissed WaaP or sign-in failed — no inline error on navbar
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/Avril.png" alt="Avril logo" width={96} height={60} className="h-10 w-auto object-contain" priority />
          <span className="hidden avril-wordmark text-sm sm:inline">{t.brand}</span>
        </Link>

        <div className="flex items-center gap-3">
          <LanguageToggle />
          <MarketingBrandButton
            label={busy ? t.nav.signingIn : t.nav.signIn}
            onClick={() => void handleSignIn()}
            disabled={busy}
          />
        </div>
      </div>
    </header>
  );
}
