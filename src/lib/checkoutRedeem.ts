'use client';

/**
 * Client-side "redeem" credit for the Opción R flow.
 *
 * When a paid Stripe checkout cannot deploy (idea unavailable, or any other
 * post-payment failure), we persist the paid checkout session id so the user
 * can pick another opportunity WITHOUT being charged again. The next checkout
 * step reuses the same session_id and overrides the opportunity with the newly
 * selected one.
 *
 * The credit is written to BOTH sessionStorage and localStorage so it survives
 * a tab reload AND a full browser close / new tab. The authoritative record of
 * the payment is the server-side deploymentIntent (see serverBilling.ts); this
 * storage is only the client pointer used to wire the reuse.
 */
export type RedeemCheckout = {
  /** Paid Stripe Checkout session id to reuse. */
  sessionId: string;
  /** Plan id that was already paid for. */
  planId: string;
  /** Newly selected RAG opportunity uuid (filled when the user re-picks). */
  opportunityId?: string;
  /** Newly selected company name (filled when the user re-picks). */
  companyName?: string;
};

const STORAGE_KEYS = ['avril_redeem_checkout', 'avril_redeem_checkout_persist'];

function readFrom(storage: Storage | null): RedeemCheckout | null {
  if (!storage) return null;
  try {
    for (const key of STORAGE_KEYS) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as RedeemCheckout;
      if (parsed?.sessionId && parsed.planId) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeTo(storage: Storage | null, value: RedeemCheckout | null) {
  if (!storage) return;
  try {
    if (value === null) {
      for (const key of STORAGE_KEYS) storage.removeItem(key);
    } else {
      const raw = JSON.stringify(value);
      for (const key of STORAGE_KEYS) storage.setItem(key, raw);
    }
  } catch {
    /* storage may be unavailable (private mode); redeem degrades to re-checkout */
  }
}

export function readRedeemCheckout(): RedeemCheckout | null {
  if (typeof window === 'undefined') return null;
  return readFrom(window.sessionStorage) ?? readFrom(window.localStorage);
}

export function writeRedeemCheckout(value: RedeemCheckout) {
  if (typeof window === 'undefined') return;
  writeTo(window.sessionStorage, value);
  writeTo(window.localStorage, value);
}

export function updateRedeemCheckout(patch: Partial<RedeemCheckout>) {
  const current = readRedeemCheckout();
  if (!current) return;
  writeRedeemCheckout({ ...current, ...patch });
}

export function clearRedeemCheckout() {
  if (typeof window === 'undefined') return;
  writeTo(window.sessionStorage, null);
  writeTo(window.localStorage, null);
}
