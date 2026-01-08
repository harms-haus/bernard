import { NextRequest, NextResponse } from 'next/server';
import { getLogStreamer } from '@/lib/services/LogStreamer';

const VALID_PROVIDERS = ['github', 'google'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string[] }> }
) {
  const resolvedParams = await params;
  const providerPath = resolvedParams.provider;
  const action = providerPath[0];
  const rest = providerPath.slice(1);

  if (!VALID_PROVIDERS.includes(providerPath[0])) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const provider = providerPath[0];

  switch (action) {
    case 'login':
      const state = rest[0] || '';
      const callbackUrl = rest[1] || '/status';
      const authUrl = `/bernard/api/auth/${provider}/login?state=${encodeURIComponent(state)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
      return NextResponse.redirect(new URL(authUrl, request.url));

    case 'callback':
      const searchParams = new URL(request.url).searchParams;
      const error = searchParams.get('error');
      if (error) {
        return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
      }
      return NextResponse.redirect(new URL('/status', request.url));

    default:
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string[] }> }
) {
  const resolvedParams = await params;
  const action = resolvedParams.provider[0];

  if (action === 'logout') {
    const response = NextResponse.json({ success: true });
    response.cookies.set('bernard_session', '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    return response;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
