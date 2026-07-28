import { mutation } from './_generated/server';
import { v } from 'convex/values';

const SERVER_SECRET_ENV = 'CONVEX_SERVER_SECRET';

function requireServerSecret(serverSecret: string | undefined) {
  const expected = process.env[SERVER_SECRET_ENV];
  if (!expected || serverSecret !== expected) {
    throw new Error('Unauthorized: invalid or missing server secret.');
  }
}

function walletEmail(walletAddress: string) {
  return `${walletAddress}@wallet.avril`;
}

/**
 * Ensures a Convex users row exists for a wallet signer (idempotent).
 * Used by luck-intake to attach founderIdeas to the signing wallet.
 */
export const ensureWalletUserServer = mutation({
  args: {
    walletAddress: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);

    const walletAddress = args.walletAddress.trim().toLowerCase();
    if (!walletAddress || !/^0x[a-f0-9]{40}$/.test(walletAddress)) {
      throw new Error('Invalid wallet address');
    }

    const existing = await ctx.db
      .query('users')
      .withIndex('by_wallet', (q) => q.eq('walletAddress', walletAddress))
      .first();
    if (existing) return existing._id;

    const email = walletEmail(walletAddress);
    const byEmail = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first();

    if (byEmail) {
      if (byEmail.walletAddress !== walletAddress) {
        await ctx.db.patch(byEmail._id, { walletAddress });
      }
      return byEmail._id;
    }

    const now = new Date().toISOString();
    return await ctx.db.insert('users', {
      email,
      walletAddress,
      createdAt: now,
    });
  },
});
