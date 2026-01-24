import type { Context } from 'hono'
import { auth } from './auth'

/**
 * Get session from Hono context
 */
export async function getSession(c: Context) {
  const headersObj: Record<string, string> = {}
  c.req.raw.headers.forEach((value, key) => {
    headersObj[key] = value
  })
  return await auth.api.getSession({
    headers: headersObj,
  })
}

/**
 * Require authentication - returns session or null
 */
export async function requireAuth(c: Context) {
  const session = await getSession(c)
  return session
}

/**
 * Require admin role - returns session if admin, null otherwise
 */
export async function requireAdmin(c: Context) {
  const session = await getSession(c)
  return session?.user.role === 'admin' ? session : null
}

/**
 * Deny access to guest users.
 * Returns the session if the user is authenticated and not a guest.
 * Returns null if the user is not authenticated OR is a guest.
 */
export async function denyGuest(c: Context) {
  const session = await getSession(c)
  if (!session) {
    return null // Not authenticated
  }
  if (session.user.role === 'guest') {
    return null // Deny access to guests
  }
  return session
}

/**
 * Require a non-guest user (alias for denyGuest with clearer intent).
 * Use this when you want to explicitly require authenticated non-guest access.
 */
export async function requireNonGuest(c: Context) {
  return denyGuest(c)
}
