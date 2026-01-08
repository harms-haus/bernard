import { getRedis } from '@lib/shared/infra/redis'
import { buildStores } from '@lib/shared/auth'
import { appSettings } from '@lib/shared/config/appSettings'
import type { OAuthSettings, OAuthClientSettings } from '@lib/shared/config/appSettings'

export interface OAuthConfig {
  authUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface OAuthState {
  codeVerifier: string
  returnTo: string
  provider: string
}

export async function getOAuthConfig(provider: string): Promise<OAuthConfig> {
  const oauthSettings = await appSettings.getOAuth()
  
  const providerKey = provider.toLowerCase() as keyof OAuthSettings
  const config = oauthSettings[providerKey] || oauthSettings.default

  if (!config) {
    throw new Error(`OAuth provider '${provider}' not configured`)
  }

  return {
    authUrl: config.authUrl,
    tokenUrl: config.tokenUrl,
    userInfoUrl: config.userInfoUrl,
    scopes: config.scope,
    clientId: config.clientId,
    clientSecret: config.clientSecret || '',
    redirectUri: config.redirectUri,
  }
}

export async function createOAuthState(
  provider: string,
  returnTo: string = '/status'
): Promise<string> {
  const redis = getRedis()
  const stores = buildStores(redis)

  // Generate code verifier
  const codeVerifier = createCodeVerifier()
  
  // Create state with code verifier
  const stateData: OAuthState = {
    codeVerifier,
    returnTo,
    provider,
  }
  
  const state = generateState()
  const stateKey = `bernard:oauth:state:${provider}:${state}`
  
  // Store state for 10 minutes
  await redis.setex(stateKey, 600, JSON.stringify(stateData))
  
  return state
}

export async function validateOAuthState(
  provider: string,
  state: string
): Promise<OAuthState | null> {
  const redis = getRedis()
  const stateKey = `bernard:oauth:state:${provider}:${state}`
  
  const stored = await redis.get(stateKey)
  if (!stored) {
    return null
  }

  // Delete state after retrieval (one-time use)
  await redis.del(stateKey)
  
  try {
    return JSON.parse(stored) as OAuthState
  } catch {
    return null
  }
}

export async function exchangeCodeForToken(
  provider: string,
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const config = await getOAuthConfig(provider)
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    ...(config.clientSecret && { client_secret: config.clientSecret }),
    code_verifier: codeVerifier,
  })

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  const data = await response.json()
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

export async function fetchUserInfo(
  provider: string,
  accessToken: string
): Promise<{
  id: string
  displayName: string
  email?: string
  avatarUrl?: string
}> {
  const config = await getOAuthConfig(provider)
  
  const response = await fetch(config.userInfoUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`)
  }

  const data = await response.json()

  // Provider-specific parsing
  switch (provider) {
    case 'github':
      return {
        id: String(data.id),
        displayName: data.name || data.login,
        email: data.email,
        avatarUrl: data.avatar_url,
      }
    case 'google':
      return {
        id: data.sub,
        displayName: data.name,
        email: data.email,
        avatarUrl: data.picture,
      }
    default:
      return {
        id: data.id || data.sub || String(data),
        displayName: data.name || data.displayName || data.username || data.email || 'User',
        email: data.email,
        avatarUrl: data.avatarUrl || data.picture || data.avatar_url,
      }
  }
}

export async function createOAuthSession(
  provider: string,
  userInfo: { id: string; displayName: string; email?: string; avatarUrl?: string }
): Promise<{ sessionId: string; userId: string }> {
  const redis = getRedis()
  const stores = buildStores(redis)

  // Upsert user
  const user = await stores.userStore.upsertOAuthUser(
    userInfo.id,
    userInfo.displayName,
    userInfo.email,
    userInfo.avatarUrl
  )

  // Create session
  const session = await stores.sessionStore.create(user.id, {
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
  })

  return { sessionId: session.id, userId: user.id }
}

// PKCE utilities
function createCodeVerifier(): string {
  const array = new Uint8Array(64)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for non-secure contexts
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
  }
  return base64UrlEncode(array)
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64')
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateState(): string {
  const array = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
  }
  return base64UrlEncode(array)
}
