import { NextRequest, NextResponse } from 'next/server'
import { error, ok } from '../../../../lib/api/response'
import { getOAuthConfig, createOAuthState } from '../../../../lib/auth/oauth'

const VALID_PROVIDERS = ['github', 'google'] as const

export type LoginProvider = typeof VALID_PROVIDERS[number]

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

export async function handleLogin(body: LoginBody): Promise<NextResponse> {
  const { provider, returnTo = '/' } = body

  if (!provider || !VALID_PROVIDERS.includes(provider as LoginProvider)) {
    return error('Invalid provider', 400)
  }

  // Validate returnTo for security (prevent open redirect)
  if (!validateReturnTo(returnTo)) {
    return error('Invalid returnTo parameter', 400)
  }

  try {
    const config = await getOAuthConfig(provider)

    if (!config.authUrl || !config.clientId || !config.redirectUri) {
      return error('OAuth not configured. Please set up OAuth environment variables.', 500)
    }

    const state = await createOAuthState(provider, returnTo)

    const authUrl = new URL(config.authUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('redirect_uri', config.redirectUri)
    authUrl.searchParams.set('scope', config.scopes)
    authUrl.searchParams.set('state', state)

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
