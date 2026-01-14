import { NextRequest, NextResponse } from 'next/server'
import { error, ok } from '../../../../lib/api/response'
import { getOAuthConfig, createOAuthState, initializeOAuth, createOAuthDependencies } from '../../../../lib/auth/oauth'
import { initializeSettingsManager } from '../../../../lib/config/appSettings'
import { getRedis } from '../../../../lib/infra/redis'
import { buildStores } from '../../../../lib/auth/authCore'
import { initializeSession, createSessionDependencies } from '../../../../lib/auth/session'

const VALID_PROVIDERS = ['github', 'google'] as const

export type LoginProvider = typeof VALID_PROVIDERS[number]

function validateReturnTo(returnTo: string): boolean {
  if (!returnTo || typeof returnTo !== 'string') {
    return false
  }

  // Allow relative paths: must start with '/' but not '//' (to avoid protocol-relative URLs)
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return true
  }

  // Check if it's an absolute URL
  try {
    const url = new URL(returnTo)

    // Reject URLs with schemes (http, https, ftp, etc.)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false
    }

    // Get allowed redirect domains from environment (comma-separated)
    const allowedDomains = process.env.ALLOWED_REDIRECT_DOMAINS
      ? process.env.ALLOWED_REDIRECT_DOMAINS.split(',').map(d => d.trim())
      : []

    // Allow if the hostname is in the whitelist
    return allowedDomains.includes(url.hostname)
  } catch {
    // Invalid URL format
    return false
  }
}

export interface LoginBody {
  provider?: string
  returnTo?: string
}

export interface LoginResult {
  authUrl: string
}

function validateLoginBody(body: unknown): body is LoginBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (b.provider !== undefined && typeof b.provider !== 'string') return false
  if (b.returnTo !== undefined && (typeof b.returnTo !== 'string' || !validateReturnTo(b.returnTo))) return false
  return true
}

// Track whether dependencies have been initialized for this process
let dependenciesInitialized = false

async function ensureDependenciesInitialized(): Promise<void> {
  if (dependenciesInitialized) return

  try {
    await initializeSettingsManager()
    
    // Debug: Log OAuth environment variables
    const oauthClientId = process.env.OAUTH_GITHUB_CLIENT_ID
    const oauthClientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET
    const oauthRedirectUri = process.env.OAUTH_GITHUB_REDIRECT_URI
    console.log('[Auth] OAuth env vars - CLIENT_ID:', oauthClientId ? 'set' : 'NOT SET')
    console.log('[Auth] OAuth env vars - CLIENT_SECRET:', oauthClientSecret ? 'set' : 'NOT SET')
    console.log('[Auth] OAuth env vars - REDIRECT_URI:', oauthRedirectUri || 'NOT SET')
    
    const redis = getRedis()
    const stores = buildStores(redis)

    initializeSession(
      createSessionDependencies(
        stores,
        {
          get(_name: string): { value: string } | undefined { return undefined },
          set(_name: string, _value: string, _options?: unknown): void {},
          delete(_name: string): void {},
        },
        604800,
        process.env.NODE_ENV === 'production'
      )
    )

    initializeOAuth(
      createOAuthDependencies(redis, stores)
    )

    dependenciesInitialized = true
  } catch (err) {
    console.error('Failed to initialize auth dependencies:', err)
    throw err
  }
}

async function handleLogin(body: LoginBody): Promise<NextResponse> {
  const { provider, returnTo = '/bernard/chat' } = body

  if (!provider || !VALID_PROVIDERS.includes(provider as LoginProvider)) {
    return error('Invalid provider', 400)
  }

  // Validate returnTo for security (prevent open redirect)
  if (!validateReturnTo(returnTo)) {
    return error('Invalid returnTo parameter', 400)
  }

  // Initialize dependencies before using them
  await ensureDependenciesInitialized()

  try {
    const config = await getOAuthConfig(provider)

    // Check which OAuth fields are missing
    const missingFields: string[] = []
    if (!config.authUrl || config.authUrl === '') missingFields.push('authUrl')
    if (!config.clientId || config.clientId === '') missingFields.push('clientId')
    if (!config.redirectUri || config.redirectUri === '') missingFields.push('redirectUri')

    if (missingFields.length > 0) {
      console.error(`OAuth configuration error for ${provider}: Missing ${missingFields.join(', ')}. ` +
        `Required environment variables: OAUTH_${provider.toUpperCase()}_CLIENT_ID, ` +
        `OAUTH_${provider.toUpperCase()}_CLIENT_SECRET, OAUTH_${provider.toUpperCase()}_REDIRECT_URI`)
      return error(
        `OAuth not configured for ${provider}. Missing: ${missingFields.join(', ')}. ` +
        `Required env vars: OAUTH_${provider.toUpperCase()}_CLIENT_ID, ` +
        `OAUTH_${provider.toUpperCase()}_CLIENT_SECRET, OAUTH_${provider.toUpperCase()}_REDIRECT_URI`,
        500
      )
    }

    const { state, codeChallenge } = await createOAuthState(provider, returnTo)

    const authUrl = new URL(config.authUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('redirect_uri', config.redirectUri)
    authUrl.searchParams.set('scope', config.scopes)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    return ok<LoginResult>({ authUrl: authUrl.toString() })
  } catch (err) {
    console.error('Failed to initiate login:', err)
    return error('Failed to initiate login', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    if (!validateLoginBody(body)) {
      return error('Invalid request body', 400)
    }
    
    return handleLogin(body)
  } catch {
    return error('Invalid JSON', 400)
  }
}
