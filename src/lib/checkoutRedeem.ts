'use client';

/**
 * Client-side "redeem" credit for the Opción R flow.
 *
 * When a paid Stripe checkout cannot deploy because the RAG idea is no longer
 * available (Launch 409 → action "elegir_nueva_idea"), we persist the paid
 * checkout session id so the user can pick another opportunity WITHOUT being
 * charged again. The next checkout step reuses the same session_id and overrides
 * the opportunity with the newly selected one.
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

const STORAGE_KEY = 'avril_redeem_checkout';

export function readRedeemCheckout(): RedeemCheckout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RedeemCheckout;
    if (!parsed?.sessionId || !parsed.planId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRedeemCheckout(value: RedeemCheckout) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); redeem degrades to re-checkout */
  }
}

export function updateRedeemCheckout(patch: Partial<RedeemCheckout>) {
  const current = readRedeemCheckout();
  if (!current) return;
  writeRedeemCheckout({ ...current, ...patch });
}

export function clearRedeemCheckout() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}