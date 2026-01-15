import { NextRequest, NextResponse } from 'next/server'
import { error, ok } from '../api/response'
import { clearSessionCookie, getSessionFromHeader } from './session'
import { getOAuthConfig, createOAuthState, initializeOAuth, createOAuthDependencies } from './oauth'
import { initializeSettingsManager } from '../config/appSettings'
import { getRedis } from '../infra/redis'
import { buildStores } from './authCore'
import { initializeSession, createSessionDependencies } from './session'

/**
 * Validates that a returnTo value is safe for redirection.
 * Allows relative paths starting with '/' but not '//', and whitelisted domains.
 */
export function validateReturnTo(returnTo: string): boolean {
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

const VALID_PROVIDERS = ['github', 'google'] as const

export type LoginProvider = typeof VALID_PROVIDERS[number]

export interface LoginBody {
  provider?: string
  returnTo?: string
}

export interface LoginResult {
  authUrl: string
}

export function validateLoginBody(body: unknown): body is LoginBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (b.provider !== undefined && typeof b.provider !== 'string') return false
  if (b.returnTo !== undefined && (typeof b.returnTo !== 'string' || !validateReturnTo(b.returnTo))) return false
  return true
}

// Track whether dependencies have been initialized for this process
let dependenciesInitialized = false

export async function ensureDependenciesInitialized(): Promise<void> {
  if (dependenciesInitialized) return

  try {
    // Initialize settings manager
    await initializeSettingsManager()

    // Initialize session and OAuth with shared Redis and stores
    const redis = getRedis()
    const stores = buildStores(redis)

    // Initialize session
    const cookieStore = {
      get(_name: string): { value: string } | undefined {
        return undefined // Cookie store not needed for login initiation
      },
      set(_name: string, _value: string, _options?: unknown): void {
        // Cookies are set on the response
      },
      delete(_name: string): void {
        // Cookies are deleted on the response
      },
    }
    const isProduction = process.env.NODE_ENV === 'production'

    initializeSession(
      createSessionDependencies(
        stores,
        cookieStore,
        604800, // 7 days
        isProduction
      )
    )

    // Initialize OAuth
    initializeOAuth(
      createOAuthDependencies(redis, stores)
    )

    dependenciesInitialized = true
  } catch (err) {
    console.error('Failed to initialize auth dependencies:', err)
    throw err
  }
}

export async function handleLogin(body: LoginBody): Promise<NextResponse> {
  console.log('[handleLogin] Received body:', JSON.stringify(body))
  const { provider, returnTo = '/bernard/chat' } = body
  console.log('[handleLogin] provider:', provider, 'returnTo:', returnTo)

  if (!provider || !VALID_PROVIDERS.includes(provider as LoginProvider)) {
    console.log('[handleLogin] Invalid provider:', provider)
    return error('Invalid provider', 400)
  }

  // Validate returnTo for security (prevent open redirect)
  if (!validateReturnTo(returnTo)) {
    console.log('[handleLogin] Invalid returnTo:', returnTo)
    return error('Invalid returnTo parameter', 400)
  }

  // Initialize dependencies before using them
  await ensureDependenciesInitialized()
  console.log('[handleLogin] Dependencies initialized')

  try {
    const config = await getOAuthConfig(provider)
    console.log('[handleLogin] config.authUrl:', config.authUrl)
    console.log('[handleLogin] config.clientId:', config.clientId ? 'set' : 'empty')
    console.log('[handleLogin] config.redirectUri:', config.redirectUri)

    if (!config.authUrl || !config.clientId || !config.redirectUri) {
      return error('OAuth not configured. Please set up OAuth environment variables.', 500)
    }

    const { state, codeChallenge } = await createOAuthState(provider, returnTo)
    console.log('[handleLogin] Generated state:', state.substring(0, 20) + '...')

    const authUrl = new URL(config.authUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('redirect_uri', config.redirectUri)
    authUrl.searchParams.set('scope', config.scopes)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    console.log('[handleLogin] Final authUrl:', authUrl.toString())
    return ok<LoginResult>({ authUrl: authUrl.toString() })
  } catch (err) {
    console.error('[handleLogin] Error:', err)
    return error('Failed to initiate login', 500)
  }
}

export async function handleLogout(): Promise<NextResponse> {
  try {
    await clearSessionCookie()
    return ok({ success: true })
  } catch {
    return error('Failed to logout', 500)
  }
}

export interface MeUser {
  id: string
  displayName: string
  isAdmin: boolean
  status: 'active' | 'disabled' | 'deleted'
  createdAt: string
  updatedAt: string
  avatarUrl?: string
  email?: string
}

export interface MeResponse {
  user: MeUser
  sessionId: string
}

export async function handleMe(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const session = await getSessionFromHeader(authHeader)

  if (!session) {
    return error('Not authenticated', 401)
  }

  return ok<MeResponse>({
    user: {
      id: session.user.id,
      displayName: session.user.displayName,
      isAdmin: session.user.isAdmin,
      status: session.user.status,
      createdAt: session.user.createdAt,
      updatedAt: session.user.updatedAt,
      avatarUrl: session.user.avatarUrl,
      email: session.user.email,
    },
    sessionId: session.sessionId,
  })
}
