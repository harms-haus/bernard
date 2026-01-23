import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { corsConfig } from './middleware/cors'
import { errorHandler } from './middleware/errorHandler'
import { authMiddleware } from './middleware/auth'
import { routeHeadersMiddleware } from './middleware/headers'
import routes from './routes'

const app = new Hono()

// Global middleware
app.use('*', logger())

// CORS configuration
app.use('*', corsConfig)

// Route-specific headers middleware (applies no-cache headers to streaming routes)
app.use('/api/*', routeHeadersMiddleware)

// Apply API routes first (API routes handle their own auth)
app.route('/api', routes)

// Health check (public, no auth required)
app.get('/health', (c) => c.json({ status: 'ok' }))

// Auth middleware for frontend routes only (not API routes)
// This protects frontend pages like /bernard/chat, /bernard/admin, etc.
app.use('*', async (c, next) => {
  // Skip auth middleware for API routes and health check (already handled above)
  if (c.req.path.startsWith('/api') || c.req.path === '/health') {
    return next()
  }
  // Apply auth middleware to frontend routes
  return authMiddleware(c, next)
})

// Serve static assets (Vite build output)
// This will be used in production
// In development, @hono/vite-dev-server handles static assets
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
}

// Error handler
app.onError(errorHandler)

// For development, this is handled by @hono/vite-dev-server
// For production, use Bun's built-in server:
export default {
  port: parseInt(process.env.PORT || '3456', 10),
  fetch: app.fetch,
}
