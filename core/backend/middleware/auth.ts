import { Context, Next } from 'hono'
import { getSessionCookie } from 'better-auth/cookies'
import { auth } from '../../src/lib/auth/auth'
import '../../types'

// Routes that require authentication (any logged-in user)
const protectedRoutes = [
  '/bernard/chat',
  '/bernard/profile',
  '/bernard/keys',
  '/bernard/user',
  '/bernard/tasks',
]

// Routes that require admin role
const adminRoutes = [
  '/bernard/admin',
  '/bernard/admin/models',
  '/bernard/admin/services',
  '/bernard/admin/users',
]

// Public routes that don't require authentication
const publicRoutes = [
  '/auth/login',
  '/auth/verify-admin',
  '/auth/logout',
  '/status',
  '/403',
  '/health',
]

export async function authMiddleware(c: Context, next: Next) {
  const pathname = new URL(c.req.url).pathname

  // Skip auth check for public routes (strict whole-segment matching)
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return next()
  }

  // Check if route requires auth
  const requiresAuth = protectedRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))
  const isAdminRoute = adminRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))

  if (!requiresAuth && !isAdminRoute) {
    return next()
  }

  // Check session cookie
  const sessionToken = getSessionCookie(c.req.raw)

  // No session - redirect to login with redirectTo preserved
  if (!sessionToken) {
    const redirectUrl = new URL('/auth/login', c.req.url)
    redirectUrl.searchParams.set('redirectTo', pathname)
    return c.redirect(redirectUrl.toString())
  }

  // Set sessionToken in context for downstream use
  c.set('sessionToken', sessionToken)

  // For admin routes, verify admin role server-side
  if (isAdminRoute) {
    // Verify session and decode JWT to check user role
    try {
      const headersObj: Record<string, string> = {}
      c.req.raw.headers.forEach((value, key) => {
        headersObj[key] = value
      })
      
      const session = await auth.api.getSession({
        headers: headersObj,
      })
      
      if (!session || session.user?.role !== 'admin') {
        return c.redirect('/403')
      }
      
      // Store session in context for downstream use
      c.set('session', session)
    } catch (error) {
      // Session verification failed - deny access
      return c.redirect('/403')
    }
  } else {
    // For protected routes, get session and store in context
    try {
      const headersObj: Record<string, string> = {}
      c.req.raw.headers.forEach((value, key) => {
        headersObj[key] = value
      })
      
      const session = await auth.api.getSession({
        headers: headersObj,
      })
      
      if (!session) {
        // No session - redirect to login with redirectTo preserved
        const redirectUrl = new URL('/auth/login', c.req.url)
        redirectUrl.searchParams.set('redirectTo', pathname)
        return c.redirect(redirectUrl.toString())
      }
      
      c.set('session', session)
    } catch (error) {
      // Session verification failed - deny access
      const redirectUrl = new URL('/auth/login', c.req.url)
      redirectUrl.searchParams.set('redirectTo', pathname)
      return c.redirect(redirectUrl.toString())
    }
  }

  // Session cookie exists and route is not admin-protected - allow access
  return next()
}
