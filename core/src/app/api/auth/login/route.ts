import { NextRequest, NextResponse } from 'next/server'
import { getOAuthConfig, createOAuthState } from '@/lib/auth/oauth'

export const runtime = 'nodejs'

const VALID_PROVIDERS = ['github', 'google']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { provider?: string; returnTo?: string }

    const { provider, returnTo = '/' } = body

    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    const config = await getOAuthConfig(provider)

    if (!config.authUrl || !config.clientId || !config.redirectUri) {
      return NextResponse.json({ error: 'OAuth not configured. Please set up OAuth environment variables.' }, { status: 500 })
    }

    const state = await createOAuthState(provider, returnTo)

    const authUrl = new URL(config.authUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('redirect_uri', config.redirectUri)
    authUrl.searchParams.set('scope', config.scopes)
    authUrl.searchParams.set('state', state)

    return NextResponse.json({ authUrl: authUrl.toString() })
  } catch (error) {
    console.error('OAuth login error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to initiate login'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
