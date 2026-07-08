'use client';

import { useState } from 'react';
import NavDrawer from './Sidebar';
import Topbar from './Topbar';
import { WalletSignInPanel } from './WalletSignInPanel';
import { useWaaP } from './WaaPProvider';

export default function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isReady, isAuthenticated } = useWaaP();

  if (!isReady) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--avril-canvas)] text-sm text-muted-foreground font-sans">
        Initializing session…
      </main>
    );
  }

  if (!isAuthenticated) {
    return <WalletSignInPanel />;
  }

  return (
    <>
      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Topbar menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((v) => !v)} />
      <main className="min-h-screen max-w-full flex-1 bg-[var(--avril-canvas)] p-4 pt-16 md:p-6 md:pt-20">
        {children}
      </main>
    </>
  );
}
