import { cookies } from 'next/headers'
import { getRedis } from '@lib/shared/infra/redis'
import { buildStores, type AuthStores, type SessionRecord } from '@lib/shared/auth'
import { getAdminUser } from './adminAuth'

const SESSION_COOKIE_NAME = 'bernard_session'

let stores: AuthStores | null = null

function getStores(): AuthStores {
  if (!stores) {
    const redis = getRedis()
    stores = buildStores(redis)
  }
  return stores
}

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

export async function getSessionFromCookie(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!sessionId) {
    return null
  }

  const authStores = getStores()
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

export async function getSessionFromHeader(authHeader: string | null): Promise<AuthenticatedSession | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  const authStores = getStores()

  // Try validating as API token first
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

  // Try validating as session
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

export async function getCurrentUser(authHeader?: string | null): Promise<AuthenticatedSession | null> {
  // Check admin key first
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

  // Try session cookie
  const sessionUser = await getSessionFromCookie()
  if (sessionUser) {
    return sessionUser
  }

  // Try session/token in header
  return getSessionFromHeader(authHeader || null)
}

export async function requireAuth(): Promise<AuthenticatedSession> {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('Authentication required')
  }

  return user
}

export async function requireAdmin(): Promise<AuthenticatedSession> {
  const user = await requireAuth()
  
  if (!user.user.isAdmin) {
    throw new Error('Admin access required')
  }

  return user
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const maxAge = parseInt(process.env.SESSION_TTL_SECONDS || '604800', 10)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
