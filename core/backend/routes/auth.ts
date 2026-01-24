import { Hono } from 'hono'
import { auth } from '../../src/lib/auth/auth'
import { getSession } from '../utils/auth'
import { logger } from '../../src/lib/logging/logger'

const authRoutes = new Hono()

// GET /api/auth/get-session - Get current session
authRoutes.get('/get-session', async (c) => {
  try {
    const session = await getSession(c)
    if (!session) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    return c.json({ session })
  } catch (error) {
    logger.error({ error }, 'Error getting session')
    return c.json({ session: null }, 500)
  }
})

// GET /api/auth/logout - Sign out and redirect
authRoutes.get('/logout', async (c) => {
  // Sign out the user
  await auth.api.signOut({
    headers: Object.fromEntries(c.req.raw.headers.entries()),
  })

  // Redirect to login page
  const redirectUrl = new URL('/auth/login', c.req.url)
  return c.redirect(redirectUrl.toString())
})

// Better-Auth API routes (all Better-Auth endpoints)
// This handles all other auth routes like /api/auth/sign-in, /api/auth/sign-up, etc.
authRoutes.all('/*', async (c) => {
  const response = await auth.handler(c.req.raw)
  
  // Hono can return Response objects directly, which preserves all headers including Set-Cookie
  return response
})

export default authRoutes
