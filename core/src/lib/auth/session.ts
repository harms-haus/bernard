import type { AuthStores, SessionRecord } from '@/lib/auth'
import { getAdminUser } from './adminAuth'
export { bearerToken } from './helpers'

export interface SessionUser {
  id: string
  displayName: string
  isAdmin: boolean
  status: 'active' | 'disabled' | 'deleted'
  createdAt: string
  updatedAt: string
  avatarUrl?: string
  email?: string
}

export interface AuthenticatedSession {
  user: SessionUser
  sessionId: string
  session?: SessionRecord
}

const SESSION_COOKIE_NAME = 'bernard_session'

export interface CookieStore {
  get(name: string): { value: string } | undefined
  set(name: string, value: string, options?: CookieOptions): void
  delete(name: string): void
}

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  maxAge?: number
  path?: string
  domain?: string
}

export interface SessionDependencies {
  stores: AuthStores
  cookieStore: CookieStore
  sessionTtlSeconds: number
  isProduction: boolean
}

// Factory function for creating session dependencies
export function createSessionDependencies(
  stores: AuthStores,
  cookieStore: CookieStore,
  sessionTtlSeconds: number = 604800,
  isProduction: boolean = false
): SessionDependencies {
  return { stores, cookieStore, sessionTtlSeconds, isProduction }
}

let defaultDependencies: SessionDependencies | null = null

export function initializeSession(dependencies: SessionDependencies): void {
  defaultDependencies = dependencies
}

export function resetSession(): void {
  defaultDependencies = null
}

function getDefaultDependencies(): SessionDependencies {
  if (!defaultDependencies) {
    throw new Error('Session dependencies not initialized. Pass dependencies explicitly or call initializeSession().')
  }
  return defaultDependencies
}

function getStores(deps: SessionDependencies): AuthStores {
  return deps.stores
}

export async function getSessionFromCookie(deps?: SessionDependencies): Promise<AuthenticatedSession | null> {
  const d = deps || getDefaultDependencies()
  const { cookieStore, stores } = d
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!sessionId) {
    return null
  }

  const authStores = getStores(d)
  const session = await authStores.sessionStore.get(sessionId)
  
  if (!session) {
    return null
  }

  const user = await authStores.userStore.get(session.userId)

  if (!user || user.status === 'deleted') {
    return null
  }

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      avatarUrl: user.avatarUrl,
      email: user.email,
    },
    sessionId,
    session,
  }
}

export async function getSessionFromHeader(authHeader: string | null, deps?: SessionDependencies): Promise<AuthenticatedSession | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  const d = deps || getDefaultDependencies()
  const authStores = getStores(d)

  const tokenRecord = await authStores.tokenStore.validate(token)
  if (tokenRecord) {
    if (tokenRecord.status !== 'active') {
      return null
    }

    let user = tokenRecord.userId 
      ? await authStores.userStore.get(tokenRecord.userId)
      : null

    if (!user || user.status === 'deleted') {
      const now = new Date().toISOString()
      return {
        user: {
          id: `token-${tokenRecord.id}`,
          displayName: tokenRecord.name || 'API Token',
          isAdmin: false,
          status: 'active',
          createdAt: tokenRecord.createdAt,
          updatedAt: now,
        },
        sessionId: `token-${tokenRecord.id}`,
      }
    }

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        avatarUrl: user.avatarUrl,
        email: user.email,
      },
      sessionId: `token-${tokenRecord.id}`,
    }
  }

  const session = await authStores.sessionStore.get(token)
  if (session) {
    const user = await authStores.userStore.get(session.userId)
    
    if (!user || user.status === 'deleted') {
      return null
    }

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        avatarUrl: user.avatarUrl,
        email: user.email,
      },
      sessionId: token,
      session,
    }
  }

  return null
}

export async function getCurrentUser(authHeader?: string | null, deps?: SessionDependencies): Promise<AuthenticatedSession | null> {
  const d = deps || getDefaultDependencies()
  
  const adminUser = getAdminUser(
    process.env.ADMIN_API_KEY,
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  )

  if (adminUser) {
    return {
      user: {
        id: adminUser.user.id,
        displayName: adminUser.user.displayName,
        isAdmin: adminUser.user.isAdmin,
        status: adminUser.user.status,
        createdAt: adminUser.user.createdAt,
        updatedAt: adminUser.user.updatedAt,
      },
      sessionId: adminUser.sessionId || 'admin',
    }
  }

  const cookieStore = d.cookieStore
  const adminSessionKey = cookieStore.get('bernard_admin_session')?.value
  if (adminSessionKey) {
    const adminFromCookie = getAdminUser(process.env.ADMIN_API_KEY, adminSessionKey)
    if (adminFromCookie) {
      const now = new Date().toISOString()
      return {
        user: {
          id: adminFromCookie.user.id,
          displayName: adminFromCookie.user.displayName,
          isAdmin: adminFromCookie.user.isAdmin,
          status: adminFromCookie.user.status,
          createdAt: adminFromCookie.user.createdAt,
          updatedAt: now,
        },
        sessionId: 'admin-cookie',
      }
    }
  }

  const sessionUser = await getSessionFromCookie(d)
  if (sessionUser) {
    return sessionUser
  }

  return getSessionFromHeader(authHeader || null, d)
}

/**
 * Refresh session TTL if it's close to expiration.
 * This implements sliding session expiration - sessions stay alive
 * as long as the user is active.
 * Call this after validating a session to keep it alive.
 */
export async function refreshSessionIfNeeded(
  sessionId: string | null,
  deps?: SessionDependencies
): Promise<void> {
  if (!sessionId || sessionId.startsWith('token-') || sessionId === 'admin' || sessionId === 'admin-cookie') {
    // Don't refresh API tokens or admin sessions
    return;
  }

  const d = deps || getDefaultDependencies()
  const { stores } = d

  try {
    await stores.sessionStore.refreshIfNeeded(sessionId)
  } catch (error) {
    // Log but don't fail - session refresh is best-effort
    console.error('[Session] Failed to refresh session:', error)
  }
}

export async function requireAuth(deps?: SessionDependencies): Promise<AuthenticatedSession> {
  const user = await getCurrentUser(undefined, deps)
  
  if (!user) {
    throw new Error('Authentication required')
  }
  
  return user
}

export async function requireAdmin(deps?: SessionDependencies): Promise<AuthenticatedSession> {
  const user = await requireAuth(deps)
  
  if (!user.user.isAdmin) {
    throw new Error('Admin access required')
  }
  
  return user
}

export { requireAuth as requireAuthFn, requireAdmin as requireAdminFn }

export async function setSessionCookie(sessionId: string, deps?: SessionDependencies): Promise<void> {
  const d = deps || getDefaultDependencies()
  const { cookieStore, sessionTtlSeconds, isProduction } = d
  
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: sessionTtlSeconds,
    path: '/',
  }
  
  if (isProduction) {
    cookieOptions.domain = 'bernard.harms.haus'
  }
  
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, cookieOptions)
}

export async function clearSessionCookie(deps?: SessionDependencies): Promise<void> {
  const d = deps || getDefaultDependencies()
  const { cookieStore, isProduction } = d
  
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  }
  
  if (isProduction) {
    cookieOptions.domain = 'bernard.harms.haus'
  }
  
  cookieStore.set(SESSION_COOKIE_NAME, '', cookieOptions)
}
