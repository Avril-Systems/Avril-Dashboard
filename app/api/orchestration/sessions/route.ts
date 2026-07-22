import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, requireDashboardToken } from '@/src/lib/apiSecurity';
import { healOrchestrationSessionNames, listOrchestrationSessions } from '@/src/lib/convexServer';

export async function GET(req: Request) {
  try {
    if (!requireDashboardToken(req)) {
      return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }

    const ip = getClientIp(req);
    if (hitRateLimit(`orchestration:sessions:${ip}`, 60)) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : 50;

    // Best-effort: rewrite stored "# Agent brief …" labels before listing.
    try {
      await healOrchestrationSessionNames({
        limit: Number.isFinite(limit) ? Math.max(limit, 50) : 50,
      });
    } catch {
      /* heal must not block listing */
    }

    const sessions = await listOrchestrationSessions({
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return NextResponse.json({ ok: true, sessions: sessions ?? [] });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'SESSIONS_LIST_FAILED',
          message: err instanceof Error ? err.message : 'Failed to list orchestration sessions',
        },
      },
      { status: 500 }
    );
  }
}
