'use client';

import { BrowserProvider } from 'ethers';

function authMessage(nonce: string) {
  return `Avril Dashboard auth nonce: ${nonce}`;
}

async function signMessage(address: string, message: string): Promise<string> {
  const waap = window.waap;
  if (waap?.request) {
    try {
      const sig = await waap.request({
        method: 'personal_sign',
        params: [message, address],
      });
      if (typeof sig === 'string' && sig.length > 0) return sig;
    } catch {
      // fall through to ethers
    }
  }

  const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
  if (!ethereum) {
    throw new Error('No wallet available to sign the session message.');
  }

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}

export type WalletSession = {
  address: string;
  plan?: string;
  luckIdeaId?: string;
};

export async function fetchWalletSession(): Promise<WalletSession | null> {
  const res = await fetch('/api/auth/session', { credentials: 'include' });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    ok?: boolean;
    address?: string;
    plan?: string;
    luckIdeaId?: string;
  };
  if (!data.ok || !data.address) return null;
  return {
    address: data.address,
    plan: data.plan,
    luckIdeaId: data.luckIdeaId,
  };
}

export async function establishWalletSession(address: string): Promise<void> {
  const normalized = address.toLowerCase();

  const existing = await fetchWalletSession();
  if (existing?.address === normalized) return;

  const nonceRes = await fetch('/api/auth/nonce', { credentials: 'include' });
  if (!nonceRes.ok) {
    throw new Error('Could not start wallet sign-in. Is DASHBOARD_SESSION_SECRET configured?');
  }

  const { nonce } = (await nonceRes.json()) as { nonce?: string };
  if (!nonce) throw new Error('Auth nonce missing from server.');

  const message = authMessage(nonce);
  const signature = await signMessage(normalized, message);

  const sessionRes = await fetch('/api/auth/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: normalized, signature }),
  });

  if (!sessionRes.ok) {
    const err = (await sessionRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || 'Wallet signature was rejected.');
  }
}

export async function clearWalletSession(): Promise<void> {
  await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
}

export async function resolveConnectedWalletAddress(fallbackAddress?: string | null): Promise<string> {
  const fromFallback = (fallbackAddress || '').toLowerCase();
  if (fromFallback) return fromFallback;

  try {
    const accounts = await window.waap?.request?.({ method: 'eth_requestAccounts' });
    const addr = Array.isArray(accounts) ? String(accounts[0] || '').toLowerCase() : '';
    if (addr) return addr;
  } catch {
    const ethAccounts = await (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<unknown> } }).ethereum?.request?.({
      method: 'eth_requestAccounts',
    });
    const addr = Array.isArray(ethAccounts) ? String(ethAccounts[0] || '').toLowerCase() : '';
    if (addr) return addr;
  }

  throw new Error('Wallet connected but no address was returned. Try again.');
}

/** WaaP connect + SIWE message sign + server session cookie */
export async function signInWithWallet(login: () => Promise<void>, fallbackAddress?: string | null): Promise<string> {
  await login();
  const address = await resolveConnectedWalletAddress(fallbackAddress);
  await establishWalletSession(address);
  return address;
}
