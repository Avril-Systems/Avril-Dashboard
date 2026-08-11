import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, rejectLargePayload } from '@/src/lib/apiSecurity';
import { opportunityToIntake } from '@/src/lib/luckIntake';
import { createFounderIdea, ensureWalletUser } from '@/src/lib/convexServer';
import {
  buildSessionCookie,
  readSession,
  refreshSessionToken,
} from '@/src/lib/sessionAuth';
import type { Opportunity } from '@/components/flows/luck/types';

type LuckIntakeBody = {
  opportunity?: Opportunity;
};

export async function POST(req: Request) {
  try {
    const session = readSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in with your wallet to continue.' } },
        { status: 401 }
      );
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`founder:luck-intake:${ip}`, 20)) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
        { status: 429 }
      );
    }
    if (rejectLargePayload(req, 48 * 1024)) {
      return NextResponse.json(
        { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' } },
        { status: 413 }
      );
    }

    const body = (await req.json()) as LuckIntakeBody;
    const opportunity = body.opportunity;
    if (!opportunity?.id || !opportunity?.name || !opportunity?.blueprint) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'opportunity is required' } },
        { status: 400 }
      );
    }

    const intake = opportunityToIntake(opportunity);

    // 🚧 TEMP BYPASS — SOLO PARA VER DISEÑO EN LOCAL, sin Convex configurado. BORRAR ANTES DE COMMIT/PUSH.
    let founderUserId: string | undefined;
    let ideaId: string;
    if (!process.env.NEXT_PUBLIC_CONVEX_URL && process.env.NODE_ENV !== 'production') {
      ideaId = `design-preview-${Date.now()}`;
    } else {
      try {
        founderUserId = await ensureWalletUser(session.address);
      } catch {
        // Best-effort wallet link — intake still proceeds for demo spawn.
      }
      ideaId = await createFounderIdea({
        founderUserId,
        founderWallet: session.address,
        title: intake.title,
        ideaText: intake.rawIdea,
        targetUser: intake.targetUser,
        problem: intake.problem,
        monetizationPreference: intake.monetizationPreference,
        businessModelPreference: intake.businessModelPreference,
        desiredAutomationLevel: intake.desiredAutomationLevel,
        channelPreferences: intake.channelPreferences,
        riskTolerance: intake.riskTolerance,
      });
    }
    // 🚧 FIN TEMP BYPASS

    const token = refreshSessionToken(session, { luckIdeaId: String(ideaId) });
    if (!token) {
      return NextResponse.json(
        { ok: false, error: { code: 'SESSION_ERROR', message: 'Could not update session' } },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ ok: true, ideaId, founderUserId, walletAddress: session.address });
    res.headers.append('Set-Cookie', buildSessionCookie(token));
    return res;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'LUCK_INTAKE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to save luck selection',
        },
      },
      { status: 500 }
    );
  }
}
