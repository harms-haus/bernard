import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/lib/auth/session'
import { getOAuthConfig, validateOAuthState, exchangeCodeForToken, fetchUserInfo, createOAuthSession } from '@/lib/auth/oauth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const provider = 'google'
  const host = request.headers.get('host')

  console.log('[Google OAuth callback] host:', host, 'url:', request.url)

  const config = await getOAuthConfig(provider)

  if (errorParam) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorParam)}`, config.redirectUri))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=missing_params', config.redirectUri))
  }

  try {
    const stateData = await validateOAuthState(provider, state)
    console.log('[Google OAuth callback] stateData:', stateData ? 'found' : 'null')
    if (!stateData) {
      return NextResponse.redirect(new URL('/login?error=invalid_state', config.redirectUri))
    }

    const tokenResponse = await exchangeCodeForToken(provider, code, stateData.codeVerifier)
    console.log('[Google OAuth callback] tokenResponse:', tokenResponse ? 'success' : 'null')

    const userInfo = await fetchUserInfo(provider, tokenResponse.accessToken)
    console.log('[Google OAuth callback] userInfo:', userInfo ? userInfo.id : 'null')

    const { sessionId } = await createOAuthSession(provider, userInfo)
    console.log('[Google OAuth callback] sessionId:', sessionId)

    await setSessionCookie(sessionId)
    console.log('[Google OAuth callback] cookie set, redirecting to:', stateData.returnTo)

    return NextResponse.redirect(new URL(stateData.returnTo, config.redirectUri))
  } catch (error) {
    console.error('[Google OAuth callback] error:', error)
    return NextResponse.redirect(new URL('/login?error=auth_failed', config.redirectUri))
  }
}
