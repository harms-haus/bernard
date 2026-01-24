import type { Context, Next } from 'hono'
import { noCacheHeaders } from './cors'

/**
 * Middleware to apply route-specific headers based on Next.js config patterns
 * This replaces Next.js headers() configuration
 */
export async function routeHeadersMiddleware(c: Context, next: Next) {
  const pathname = c.req.path

  // Apply headers after the route handler runs
  await next()

  // Headers for /api/v1/* routes (OpenAI-compatible endpoints)
  if (pathname.startsWith('/api/v1/')) {
    // CORS headers are already handled by corsConfig middleware
    // Add no-cache headers for streaming endpoints
    Object.entries(noCacheHeaders).forEach(([key, value]) => {
      c.header(key, value)
    })
    c.header('X-Accel-Buffering', 'no')
  }

  // Headers for /api/langchain/* routes
  if (pathname.startsWith('/api/langchain/')) {
    Object.entries(noCacheHeaders).forEach(([key, value]) => {
      c.header(key, value)
    })
    c.header('X-Accel-Buffering', 'no')
  }

  // Headers for /api/logs/stream
  if (pathname === '/api/logs/stream') {
    Object.entries(noCacheHeaders).forEach(([key, value]) => {
      c.header(key, value)
    })
    c.header('X-Accel-Buffering', 'no')
  }

  // Headers for /api/threads/* routes (streaming endpoints)
  if (pathname.startsWith('/api/threads/')) {
    Object.entries(noCacheHeaders).forEach(([key, value]) => {
      c.header(key, value)
    })
    c.header('X-Accel-Buffering', 'no')
  }

  // Headers for /api/runs/* routes (streaming endpoints)
  if (pathname.startsWith('/api/runs/')) {
    Object.entries(noCacheHeaders).forEach(([key, value]) => {
      c.header(key, value)
    })
    c.header('X-Accel-Buffering', 'no')
  }
}
