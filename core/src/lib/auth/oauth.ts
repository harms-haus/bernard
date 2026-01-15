import type { OAuthSettings } from '@/lib/config/appSettings'

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

export interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<string>
  setex(key: string, seconds: number, value: string): Promise<string>
  del(key: string): Promise<number>
}

export interface AuthStores {
  userStore: {
    upsertOAuthUser: (id: string, displayName: string, email?: string, avatarUrl?: string) => Promise<{ id: string }>
  }
  sessionStore: {
    create: (userId: string, data?: { userAgent?: string }) => Promise<{ id: string }>
  }
}

export interface OAuthDependencies {
  redis: RedisClient
  stores: AuthStores
}

export function createOAuthDependencies(redis: RedisClient, stores: AuthStores): OAuthDependencies {
  return { redis, stores }
}

let defaultDependencies: OAuthDependencies | null = null

function getDefaultDependencies(): OAuthDependencies {
  if (!defaultDependencies) {
    throw new Error('OAuth dependencies not initialized. Pass dependencies explicitly or call initializeOAuth().')
  }
  return defaultDependencies
}

export function initializeOAuth(dependencies: OAuthDependencies): void {
  defaultDependencies = dependencies
}

export function resetOAuth(): void {
  defaultDependencies = null
}

export async function getOAuthConfig(provider: string, _deps?: OAuthDependencies): Promise<OAuthConfig> {
  const { SettingsManagerCore } = await import('@/lib/config/appSettings')
  const manager = SettingsManagerCore.getInstance()
  const oauthSettings = await manager.getOAuth()
  
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
  returnTo: string = '/bernard/chat',
  deps?: OAuthDependencies
): Promise<{ state: string; codeChallenge: string }> {
  const d = deps || getDefaultDependencies()
  const { redis } = d

  const codeVerifier = createCodeVerifier()
  const codeChallenge = createCodeChallenge(codeVerifier)

  const stateData: OAuthState = {
    codeVerifier,
    returnTo,
    provider,
  }

  const state = generateState()
  const stateKey = `bernard:oauth:state:${provider}:${state}`

  await redis.setex(stateKey, 600, JSON.stringify(stateData))

  return { state, codeChallenge }
}

export async function validateOAuthState(
  provider: string,
  state: string,
  deps?: OAuthDependencies
): Promise<OAuthState | null> {
  const d = deps || getDefaultDependencies()
  const { redis } = d
  const stateKey = `bernard:oauth:state:${provider}:${state}`
  
  const stored = await redis.get(stateKey)
  if (!stored) {
    return null
  }

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
      ...(provider === 'github' && { 'User-Agent': 'bernard-oauth' }),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`)
  }

  const data = await response.json()

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
  userInfo: { id: string; displayName: string; email?: string; avatarUrl?: string },
  deps?: OAuthDependencies
): Promise<{ sessionId: string; userId: string }> {
  const d = deps || getDefaultDependencies()
  const { stores } = d

  const user = await stores.userStore.upsertOAuthUser(
    userInfo.id,
    userInfo.displayName,
    userInfo.email,
    userInfo.avatarUrl
  )

  const session = await stores.sessionStore.create(user.id, {
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
  })

  return { sessionId: session.id, userId: user.id }
}

function createCodeVerifier(): string {
  const array = new Uint8Array(64)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
  }
  return base64UrlEncode(array)
}

function createCodeChallenge(verifier: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hashBuffer = require('node:crypto').createHash('sha256').update(data).digest()
  return base64UrlEncode(new Uint8Array(hashBuffer))
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
