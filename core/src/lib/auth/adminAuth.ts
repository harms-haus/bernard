import type { UserRecord } from './types'

export type AuthenticatedUser = {
  user: UserRecord
  sessionId: string | null
}

export function getAdminUser(adminKey: string | undefined, bearerToken: string | null): AuthenticatedUser | null {
  if (!adminKey || !bearerToken || bearerToken !== adminKey) return null
  
  const now = new Date().toISOString()
  return {
    user: {
      id: 'admin-token',
      displayName: 'Admin Token',
      isAdmin: true,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    sessionId: null
  }
}
