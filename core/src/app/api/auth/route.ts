import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, setSessionCookie, clearSessionCookie } from '@/lib/auth/session'
import { 
  getOAuthConfig, 
  createOAuthState, 
  validateOAuthState, 
  exchangeCodeForToken, 
  fetchUserInfo, 
  createOAuthSession 
} from '@/lib/auth/oauth'
import { validateReturnTo, ensureDependenciesInitialized } from '@/lib/auth/validation'

export const runtime = 'nodejs'

const VALID_PROVIDERS = ['github', 'google']

export async function GET(request: NextRequest) {
  // Initialize auth dependencies before handling requests
  await ensureDependenciesInitialized()
  
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  switch (action) {
    case 'me': {
      const authHeader = request.headers.get('authorization')
      const authUser = await getCurrentUser(authHeader)
      
      if (!authUser) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      }
      
      return NextResponse.json({
        user: authUser.user,
        sessionId: authUser.sessionId
      })
    }

    case 'csrf': {
      return NextResponse.json({ token: crypto.randomUUID() })
    }

    case 'providers': {
      const providers: Record<string, { name: string; url: string }> = {}
      
      for (const provider of VALID_PROVIDERS) {
        const config = await getOAuthConfig(provider)
        if (config && config.clientId && config.redirectUri) {
          providers[provider] = {
            name: provider.charAt(0).toUpperCase() + provider.slice(1),
            url: `/api/auth?action=login&provider=${provider}`
          }
        }
      }
      
      return NextResponse.json(providers)
    }

    case 'login': {
      const provider = searchParams.get('provider')
      const returnTo = searchParams.get('returnTo')
      
      if (!provider || !VALID_PROVIDERS.includes(provider)) {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
      }
      
      const config = await getOAuthConfig(provider)
      if (!config) {
        return NextResponse.json({ error: 'Provider not configured' }, { status: 400 })
      }
      
      const { state, codeChallenge } = await createOAuthState(provider, returnTo || '/bernard/chat')
      
      const authUrl = new URL(config.authUrl)
      authUrl.searchParams.set('client_id', config.clientId)
      authUrl.searchParams.set('redirect_uri', config.redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', config.scopes)
      authUrl.searchParams.set('state', state)
      if (codeChallenge) {
        authUrl.searchParams.set('code_challenge', codeChallenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
      }
      
      return NextResponse.redirect(authUrl.toString())
    }

    case 'callback': {
      const provider = searchParams.get('provider')
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')
      
      if (error) {
        return NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url))
      }
      
      if (!provider || !VALID_PROVIDERS.includes(provider)) {
        return NextResponse.redirect(new URL('/auth/login?error=invalid_provider', request.url))
      }
      
      if (!code || !state) {
        return NextResponse.redirect(new URL('/auth/login?error=missing_params', request.url))
      }
      
      const stateResult = await validateOAuthState(provider, state)
      if (!stateResult) {
        return NextResponse.redirect(new URL('/auth/login?error=invalid_state', request.url))
      }
      
      const { codeVerifier, returnTo: callbackUrl } = stateResult
      const config = await getOAuthConfig(provider)
      if (!config) {
        return NextResponse.redirect(new URL('/auth/login?error=provider_not_configured', request.url))
      }
      
      try {
        const tokens = await exchangeCodeForToken(provider, code, codeVerifier)
        const userInfo = await fetchUserInfo(provider, tokens.accessToken)
        
        await createOAuthSession(provider, userInfo)
        
        return NextResponse.redirect(new URL(callbackUrl, request.url))
      } catch (err) {
        console.error('OAuth callback error:', err)
        return NextResponse.redirect(new URL('/auth/login?error=callback_failed', request.url))
      }
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  // Initialize auth dependencies before handling requests
  await ensureDependenciesInitialized()
  
  const contentType = request.headers.get('content-type') || ''
  
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const { action } = body
    
    switch (action) {
      case 'logout': {
        const response = NextResponse.json({ success: true })
        response.cookies.set('bernard_session', '', {
          path: '/',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production'
        })
        return response
      }
      
      case 'refresh': {
        const authHeader = request.headers.get('authorization')
        const authUser = await getCurrentUser(authHeader)
        
        if (!authUser) {
          return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }
        
        return NextResponse.json({
          user: authUser.user,
          sessionId: authUser.sessionId
        })
      }
      
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  }
  
  const formData = await request.formData()
  const action = formData.get('action') as string | null
  
  switch (action) {
    case 'login': {
      const provider = formData.get('provider') as string | null
      const returnTo = formData.get('returnTo') as string | null
      
      if (!provider || !VALID_PROVIDERS.includes(provider)) {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
      }
      
      const config = await getOAuthConfig(provider)
      if (!config) {
        return NextResponse.json({ error: 'Provider not configured' }, { status: 400 })
      }
      
      const { state, codeChallenge } = await createOAuthState(provider, returnTo || '/bernard/chat')
      
      const authUrl = new URL(config.authUrl)
      authUrl.searchParams.set('client_id', config.clientId)
      authUrl.searchParams.set('redirect_uri', config.redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', config.scopes)
      authUrl.searchParams.set('state', state)
      if (codeChallenge) {
        authUrl.searchParams.set('code_challenge', codeChallenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
      }
      
      return NextResponse.redirect(authUrl.toString())
    }
    
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
