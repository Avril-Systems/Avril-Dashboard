import { NextResponse } from 'next/server';
import { getClientIp, hitRateLimit, requireDashboardToken } from '@/src/lib/apiSecurity';
import { updateChatTitle } from '@/src/lib/convexServer';

export async function POST(req: Request) {
  if (!requireDashboardToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (hitRateLimit(`chat-title:${ip}`, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const body = (await req.json()) as { chatId?: string; title?: string };
    const chatId = body.chatId?.trim();
    const title = body.title?.trim().slice(0, 120);
    if (!chatId || !title) {
      return NextResponse.json({ error: 'chatId and title are required' }, { status: 400 });
    }
    const saved = await updateChatTitle({ chatId, title });
    return NextResponse.json({ ok: true, title: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Convex error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
