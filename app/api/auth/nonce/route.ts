import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hasSessionSecret, makeNonce, NONCE_COOKIE } from '@/src/lib/sessionAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasSessionSecret()) {
    return NextResponse.json(
      { error: 'Missing DASHBOARD_SESSION_SECRET in server environment.' },
      { status: 500 }
    );
  }

  const nonce = makeNonce();
  cookies().set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return NextResponse.json(
    { nonce },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    }
  );
}
