import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, setSessionCookie, clearSessionCookie } from '@/lib/auth/session'
import { getOAuthConfig, createOAuthState, validateOAuthState, exchangeCodeForToken, fetchUserInfo, createOAuthSession } from '@/lib/auth/oauth'

export const runtime = 'nodejs';

const VALID_PROVIDERS = ['github', 'google']

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  switch (action) {
    case 'me': {
      const authHeader = request.headers.get('authorization')
      const user = await getCurrentUser(authHeader)
      
      if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      }

      return NextResponse.json({
        user: {
          id: user.user.id,
          displayName: user.user.displayName,
          isAdmin: user.user.isAdmin,
          status: user.user.status,
          email: user.user.email,
          avatarUrl: user.user.avatarUrl,
        },
        sessionId: user.sessionId,
      })
    }

    case 'admin': {
      const authHeader = request.headers.get('authorization')
      const user = await getCurrentUser(authHeader)
      
      if (!user || !user.user.isAdmin) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }

      return NextResponse.json({
        user: {
          id: user.user.id,
          displayName: user.user.displayName,
          isAdmin: user.user.isAdmin,
          status: user.user.status,
        },
      })
    }

    case 'login': {
      const provider = searchParams.get('provider')
      const returnTo = searchParams.get('returnTo') || '/status'

      if (!provider || !VALID_PROVIDERS.includes(provider)) {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
      }

      try {
        const config = await getOAuthConfig(provider)
        const state = await createOAuthState(provider, returnTo)
        
        // Build authorization URL with PKCE
        const authUrl = new URL(config.authUrl)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('client_id', config.clientId)
        authUrl.searchParams.set('redirect_uri', config.redirectUri)
        authUrl.searchParams.set('scope', config.scopes)
        authUrl.searchParams.set('state', state)

        return NextResponse.redirect(authUrl.toString())
      } catch (error) {
        console.error('OAuth login error:', error)
        return NextResponse.json({ error: 'Failed to initiate login' }, { status: 500 })
      }
    }

    case 'admin-login': {
      const key = searchParams.get('key')
      const returnTo = searchParams.get('returnTo') || '/status'

      if (!key) {
        return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 })
      }

      const user = await getCurrentUser(`Bearer ${key}`)
      
      if (!user || !user.user.isAdmin) {
        return NextResponse.json({ error: 'Invalid admin key' }, { status: 401 })
      }

      // For admin key login, we'll set a special session
      // This is a simplified approach - in production you'd want proper session management
      const response = NextResponse.redirect(new URL(returnTo, request.url))
      response.cookies.set('bernard_admin_session', key, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 1 day
        path: '/',
      })
      return response
    }

    case 'callback': {
      const provider = searchParams.get('provider')
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const errorParam = searchParams.get('error')
      const host = request.headers.get('host')

      console.log('[OAuth callback] host:', host, 'url:', request.url)

      if (!provider || !VALID_PROVIDERS.includes(provider)) {
        const loginUrl = new URL('/login', 'https://bernard.harms.haus')
        loginUrl.searchParams.set('error', 'invalid_provider')
        return NextResponse.redirect(loginUrl)
      }

      const config = await getOAuthConfig(provider)

      if (errorParam) {
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorParam)}`, config.redirectUri))
      }

      if (!code || !state) {
        return NextResponse.redirect(new URL('/login?error=missing_params', config.redirectUri))
      }

      try {
        // Validate state and get code verifier
        const stateData = await validateOAuthState(provider, state)
        console.log('[OAuth callback] stateData:', stateData ? 'found' : 'null')
        if (!stateData) {
          return NextResponse.redirect(new URL('/login?error=invalid_state', config.redirectUri))
        }

        // Exchange code for token
        const tokenResponse = await exchangeCodeForToken(provider, code, stateData.codeVerifier)
        console.log('[OAuth callback] tokenResponse:', tokenResponse ? 'success' : 'null')
        
        // Fetch user info
        const userInfo = await fetchUserInfo(provider, tokenResponse.accessToken)
        console.log('[OAuth callback] userInfo:', userInfo ? userInfo.id : 'null')
        
        // Create session
        const { sessionId } = await createOAuthSession(provider, userInfo)
        console.log('[OAuth callback] sessionId:', sessionId)
        
        // Set session cookie
        await setSessionCookie(sessionId)
        console.log('[OAuth callback] cookie set, redirecting to:', stateData.returnTo)

        return NextResponse.redirect(new URL(stateData.returnTo, config.redirectUri))
      } catch (error) {
        console.error('OAuth callback error:', error)
        return NextResponse.redirect(new URL('/login?error=auth_failed', config.redirectUri))
      }
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'logout') {
    await clearSessionCookie()
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
