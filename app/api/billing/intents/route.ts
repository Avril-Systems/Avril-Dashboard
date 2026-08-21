import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit } from '@/src/lib/apiSecurity';
import { readSession } from '@/src/lib/sessionAuth';
import { listPaidIntentsForWallet, sweepStaleSpawningForWallet } from '@/src/lib/convexServer';

/**
 * Lists paid, not-yet-deployed deploymentIntents for the current wallet.
 *
 * Recovery path: if the user pays, then loses the tab/browser before the deploy
 * succeeds, the client-side redeem credit is gone. The server still knows the
 * session is paid, so the deploy step can offer to reuse it instead of charging
 * again. Best-effort: any failure returns an empty list.
 */
export async function GET(req: Request) {
  try {
    const session = readSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: { message: 'Sign in with your wallet to continue.' } },
        { status: 401 }
      );
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`billing:intents:${ip}`, 30)) {
      return NextResponse.json({ ok: false, error: { message: 'Rate limit exceeded' } }, { status: 429 });
    }

    // Lazily release stale `spawning` intents to `failed` so they can be offered
    // as reusable credits again (a deploy that died is never re-charged).
    await sweepStaleSpawningForWallet({ founderWallet: session.address }).catch(() => null);

    const intents = await listPaidIntentsForWallet({ founderWallet: session.address });
    return NextResponse.json({ ok: true, intents });
  } catch {
    return NextResponse.json({ ok: true, intents: [] });
  }
}
