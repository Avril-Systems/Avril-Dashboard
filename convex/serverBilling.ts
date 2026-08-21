import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireEntity } from './lib/authz';

const SERVER_SECRET_ENV = 'CONVEX_SERVER_SECRET';

function requireServerSecret(serverSecret: string | undefined) {
  const expected = process.env[SERVER_SECRET_ENV];
  if (!expected || serverSecret !== expected) {
    throw new Error('Unauthorized: invalid or missing server secret.');
  }
}

const intentStatusValidator = v.union(
  v.literal('draft'),
  v.literal('checkout_pending'),
  v.literal('paid'),
  v.literal('spawning'),
  v.literal('deployed'),
  v.literal('failed'),
  v.literal('cancelled')
);

const intentSourceValidator = v.union(
  v.literal('form_intake'),
  v.literal('chat_intake'),
  v.literal('rag_opportunity')
);

const ACTIVE_FOR_DEDUP = new Set(['draft', 'checkout_pending', 'paid', 'spawning']);

/**
 * Creates a draft deploymentIntent for a "Deploy this company" click. When an
 * active intent already exists for the same RAG opportunity, it is returned
 * instead (client double-click / retry dedup).
 */
export const createDeploymentIntentServer = mutation({
  args: {
    organizationId: v.id('organizations'),
    source: intentSourceValidator,
    companyName: v.string(),
    opportunityId: v.optional(v.string()),
    founderWallet: v.optional(v.string()),
    founderUserId: v.optional(v.id('users')),
    founderIdeaId: v.optional(v.id('founderIdeas')),
    chatId: v.optional(v.id('chats')),
    planId: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireEntity(await ctx.db.get(args.organizationId), 'Organization');

    if (args.opportunityId) {
      const existing = await ctx.db
        .query('deploymentIntents')
        .withIndex('by_opportunityId', (q) => q.eq('opportunityId', args.opportunityId))
        .first();
      if (existing && ACTIVE_FOR_DEDUP.has(existing.status)) {
        return existing._id;
      }
    }

    const now = new Date().toISOString();
    return await ctx.db.insert('deploymentIntents', {
      organizationId: args.organizationId,
      founderWallet: args.founderWallet?.trim().toLowerCase(),
      founderUserId: args.founderUserId,
      founderIdeaId: args.founderIdeaId,
      chatId: args.chatId,
      source: args.source,
      opportunityId: args.opportunityId?.trim(),
      companyName: args.companyName.trim() || 'Untitled company',
      status: 'draft',
      planId: args.planId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Links the created Stripe Checkout session to the intent (status → checkout_pending).
 */
export const attachCheckoutSessionServer = mutation({
  args: {
    intentId: v.id('deploymentIntents'),
    stripeCheckoutSessionId: v.string(),
    planId: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const intent = requireEntity(await ctx.db.get(args.intentId), 'Deployment intent');
    const now = new Date().toISOString();
    await ctx.db.patch(intent._id, {
      status: intent.status === 'paid' ? intent.status : 'checkout_pending',
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      planId: args.planId || intent.planId,
      updatedAt: now,
    });
    return intent._id;
  },
});

/**
 * Marks an intent as paid. Called by the Stripe webhook (authoritative) and by
 * the verify/success flow as a best-effort fallback. Idempotent: a paid intent
 * stays paid (an already-deployed intent is never downgraded).
 */
export const markDeploymentIntentPaidServer = mutation({
  args: {
    stripeCheckoutSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const intent = await ctx.db
      .query('deploymentIntents')
      .withIndex('by_stripe_session', (q) =>
        q.eq('stripeCheckoutSessionId', args.stripeCheckoutSessionId)
      )
      .first();
    if (!intent) return null;

    const now = new Date().toISOString();
    // A duplicated/late Stripe webhook must never resurrect an intent that already
    // moved on: consumed (spawning/deployed), released as a reusable credit (failed)
    // or superseded (cancelled) all stay as they are.
    const alreadyClaimed = ['spawning', 'deployed', 'failed', 'cancelled'].includes(intent.status);
    await ctx.db.patch(intent._id, {
      status: alreadyClaimed ? intent.status : 'paid',
      stripePaymentIntentId: args.stripePaymentIntentId || intent.stripePaymentIntentId,
      paidAt: intent.paidAt || now,
      updatedAt: now,
    });
    return intent._id;
  },
});

/**
 * Atomically transitions a paid intent to spawning, claiming it for this deploy.
 * Returns consumed:false (with the current status) when the intent is not paid or
 * was already claimed — the caller must NOT call Launch again in that case.
 */
export const consumeDeploymentIntentServer = mutation({
  args: {
    stripeCheckoutSessionId: v.string(),
    opportunityId: v.optional(v.string()),
    companyName: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const intent = await ctx.db
      .query('deploymentIntents')
      .withIndex('by_stripe_session', (q) =>
        q.eq('stripeCheckoutSessionId', args.stripeCheckoutSessionId)
      )
      .first();
    if (!intent) return { found: false, consumed: false, status: null };

    if (intent.status === 'spawning' || intent.status === 'deployed') {
      return { found: true, consumed: false, status: intent.status };
    }
    // Both `paid` (never consumed) and `failed` (consumed then released after a
    // failed deploy) are reusable credits for any opportunity.
    if (intent.status !== 'paid' && intent.status !== 'failed') {
      return { found: true, consumed: false, status: intent.status };
    }

    const now = new Date().toISOString();
    await ctx.db.patch(intent._id, {
      status: 'spawning',
      consumedAt: now,
      updatedAt: now,
      opportunityId: args.opportunityId?.trim() || intent.opportunityId,
      companyName: args.companyName?.trim() || intent.companyName,
    });
    return { found: true, consumed: true, status: 'spawning' };
  },
});

/**
 * Releases a spawning intent to `failed` after a failed/409 deploy, so the SAME
 * paid checkout session becomes a reusable credit for another opportunity (Opción
 * R) — the user is never charged again for a retry or a re-pick. `consumedAt` is
 * kept as history; the credit is offered while status is `failed`.
 */
export const releaseDeploymentIntentServer = mutation({
  args: {
    stripeCheckoutSessionId: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const intent = await ctx.db
      .query('deploymentIntents')
      .withIndex('by_stripe_session', (q) =>
        q.eq('stripeCheckoutSessionId', args.stripeCheckoutSessionId)
      )
      .first();
    if (!intent) return { found: false, released: false };
    if (intent.status !== 'spawning') {
      return { found: true, released: false, status: intent.status };
    }
    const now = new Date().toISOString();
    await ctx.db.patch(intent._id, {
      status: 'failed',
      updatedAt: now,
    });
    return { found: true, released: true, status: 'failed' };
  },
});

export const getDeploymentIntentBySessionServer = query({
  args: {
    stripeCheckoutSessionId: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    return await ctx.db
      .query('deploymentIntents')
      .withIndex('by_stripe_session', (q) =>
        q.eq('stripeCheckoutSessionId', args.stripeCheckoutSessionId)
      )
      .first();
  },
});

/**
 * Active intent for a RAG opportunity (used by checkout to avoid re-charging a
 * paid idea, and to detect an expired checkout that must be superseded).
 */
export const getDeploymentIntentByOpportunityServer = query({
  args: {
    opportunityId: v.optional(v.string()),
    founderWallet: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (!args.opportunityId) return null;
    const wallet = args.founderWallet?.trim().toLowerCase();
    let rows = await ctx.db
      .query('deploymentIntents')
      .withIndex('by_opportunityId', (q) => q.eq('opportunityId', args.opportunityId))
      .collect();
    if (wallet) rows = rows.filter((r) => r.founderWallet?.toLowerCase() === wallet);
    if (rows.length === 0) return null;
    // Prefer the most recently updated non-cancelled intent (an earlier failed
    // checkout may leave a `cancelled` row behind for the same opportunity).
    rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    return rows.find((r) => r.status !== 'cancelled') ?? rows[0];
  },
});

/**
 * Marks an intent as cancelled (superseded by a fresh checkout). Used when the
 * attached Stripe session expired before payment: the dedup would otherwise keep
 * serving the SAME expired session URL forever (idempotency key reuse).
 */
export const cancelDeploymentIntentServer = mutation({
  args: {
    intentId: v.id('deploymentIntents'),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const intent = await ctx.db.get(args.intentId);
    if (!intent) return { found: false, cancelled: false };
    const now = new Date().toISOString();
    await ctx.db.patch(intent._id, {
      status: 'cancelled',
      updatedAt: now,
    });
    return { found: true, cancelled: true, status: 'cancelled' };
  },
});

/**
 * Links a deploymentIntent to its orchestrationSession once the session has been
 * created. This field is what makes the launch route's stale-claim guard work:
 * without it, a spawning intent whose deploy died could never be detected.
 */
export const linkOrchestrationSessionServer = mutation({
  args: {
    intentId: v.id('deploymentIntents'),
    orchestrationSessionId: v.id('orchestrationSessions'),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const intent = requireEntity(await ctx.db.get(args.intentId), 'Deployment intent');
    const now = new Date().toISOString();
    await ctx.db.patch(intent._id, {
      orchestrationSessionId: args.orchestrationSessionId,
      updatedAt: now,
    });
    return intent._id;
  },
});

/**
 * Lazily releases stale `spawning` intents to `failed` so they become reusable
 * credits. Only touches an intent whose linked orchestration session is
 * confirmed failed/stale/missing (an `active`/`queued` deploy is never released,
 * avoiding the race of freeing a healthy-but-slow deploy). Without a linked
 * session, falls back to an age threshold. Idempotent: already-released intents
 * are skipped.
 */
export const sweepStaleSpawningForWalletServer = mutation({
  args: {
    founderWallet: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const wallet = args.founderWallet.trim().toLowerCase();
    const rows = await ctx.db
      .query('deploymentIntents')
      .withIndex('by_wallet', (q) => q.eq('founderWallet', wallet))
      .collect();
    const STALE_MS = 30 * 60 * 1000;
    const now = Date.now();
    let released = 0;
    for (const row of rows) {
      if (row.status !== 'spawning') continue;
      let session =
        row.orchestrationSessionId != null
          ? await ctx.db.get(row.orchestrationSessionId)
          : undefined;
      // The intent may predate the orchestrationSessionId link (the field was
      // never written before). Fall back to the latest session for its
      // opportunity so an alive deploy is never released by the age fallback.
      if (session == null && row.opportunityId) {
        session = await ctx.db
          .query('orchestrationSessions')
          .withIndex('by_opportunityId', (q) => q.eq('opportunityId', row.opportunityId))
          .order('desc')
          .first();
      }
      // A deploy with a live orchestration session (active/queued/spawning) is
      // never released — a healthy-but-slow deploy must not be freed early.
      if (session != null && session.status !== 'failed') continue;
      const sessionDead = session != null;
      const staleFallback = session == null && now - Date.parse(row.updatedAt) > STALE_MS;
      if (sessionDead || staleFallback) {
        await ctx.db.patch(row._id, {
          status: 'failed',
          updatedAt: new Date().toISOString(),
        });
        released += 1;
      }
    }
    return { released };
  },
});

/**
 * Reusable paid credits for a wallet: intents that are `paid` (payment confirmed,
 * never consumed — e.g. after a tab close) or `failed` (payment was used for a
 * deploy that failed and was released). Either can be offered for ANY opportunity.
 *
 * The `&& row.stripeCheckoutSessionId` clause is required: a `checkout_pending`
 * intent with a dangling session (e.g. the user paid via a different session, or
 * a checkout that never completed, like a `0xdead` fake-wallet row) has no real
 * Stripe credit behind it and must never be offered.
 */
export const listPaidIntentsForWalletServer = query({
  args: {
    founderWallet: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const wallet = args.founderWallet.trim().toLowerCase();
    const rows = await ctx.db
      .query('deploymentIntents')
      .withIndex('by_wallet', (q) => q.eq('founderWallet', wallet))
      .collect();
    return rows
      .filter(
        (row) =>
          (row.status === 'paid' || row.status === 'failed') && row.stripeCheckoutSessionId
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
});
