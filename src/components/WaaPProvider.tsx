'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearWalletSession,
  fetchWalletSession,
  type WalletSession,
} from '@/src/lib/establishWalletSession';

type WaaPContextType = {
  address: string | null;
  walletSession: WalletSession | null;
  isReady: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshWalletSession: () => Promise<WalletSession | null>;
};

const WaaPContext = createContext<WaaPContextType>({
  address: null,
  walletSession: null,
  isReady: false,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  refreshWalletSession: async () => null,
});

export function useWaaP() {
  return useContext(WaaPContext);
}

export default function WaaPProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [waapReady, setWaapReady] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '';

  const refreshWalletSession = useCallback(async () => {
    const session = await fetchWalletSession();
    setWalletSession(session);
    if (session?.address) {
      setAddress((prev) => prev || session.address);
    }
    return session;
  }, []);

  useEffect(() => {
    void refreshWalletSession().finally(() => setSessionLoaded(true));
  }, [refreshWalletSession]);

  useEffect(() => {
    let mounted = true;
    let removeListener: (() => void) | undefined;

    async function boot() {
      try {
        const { initWaaP } = await import('@human.tech/waap-sdk');

        initWaaP({
          config: {
            authenticationMethods: ['wallet', 'social'],
            allowedSocials: ['google'],
            styles: { darkMode: true },
          },
          project: {
            name: 'Avril Dashboard',
            logo: process.env.NEXT_PUBLIC_WAAP_LOGO || '',
          },
          useStaging: false,
          walletConnectProjectId: walletConnectProjectId || undefined,
        } as any);

        const onAccountsChanged = (accounts: string[]) => {
          const addr = Array.isArray(accounts) ? accounts[0] : null;
          setAddress(addr ? String(addr).toLowerCase() : null);
        };
        window.waap?.on?.('accountsChanged', onAccountsChanged);
        removeListener = () => window.waap?.removeListener?.('accountsChanged', onAccountsChanged);
      } catch {
        if (mounted) setAddress(null);
      } finally {
        if (mounted) setWaapReady(true);
      }
    }

    void boot();

    return () => {
      mounted = false;
      removeListener?.();
    };
  }, [walletConnectProjectId]);

  const ctx = useMemo<WaaPContextType>(() => {
    const sessionAddress = walletSession?.address?.toLowerCase() || '';
    const clientAddress = (address || '').toLowerCase();
    const effectiveAddress = clientAddress || sessionAddress || null;
    const isAuthenticated = Boolean(effectiveAddress);

    return {
      address: effectiveAddress,
      walletSession,
      isReady: waapReady && sessionLoaded,
      isAuthenticated,
      refreshWalletSession,
      login: async () => {
        try {
          await window.waap?.login?.();

          let accounts: unknown;
          try {
            accounts = await window.waap?.request?.({ method: 'eth_requestAccounts' });
          } catch {
            accounts = await (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<unknown> } }).ethereum?.request?.({
              method: 'eth_requestAccounts',
            });
          }

          const addr = Array.isArray(accounts) ? String(accounts[0] || '').toLowerCase() : '';
          if (addr) setAddress(addr);
        } catch {
          setAddress(null);
        }
      },
      logout: async () => {
        await clearWalletSession();
        await window.waap?.logout?.();
        setAddress(null);
        setWalletSession(null);
      },
    };
  }, [address, walletSession, waapReady, sessionLoaded, refreshWalletSession]);

  return <WaaPContext.Provider value={ctx}>{children}</WaaPContext.Provider>;
}
