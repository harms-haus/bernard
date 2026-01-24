import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { corsConfig } from './middleware/cors'
import { errorHandler } from './middleware/errorHandler'
import { authMiddleware } from './middleware/auth'
import { routeHeadersMiddleware } from './middleware/headers'
import routes from './routes'
import path from 'path'
import { readFile } from 'fs/promises'

// Runtime detection: use Bun-specific APIs if available, otherwise use Node.js
const isBun = typeof Bun !== 'undefined'

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
// In development, frontend routes are handled by Vite, so we only apply auth middleware in production
if (process.env.NODE_ENV === 'production') {
  app.use('*', async (c, next) => {
    // Skip auth middleware for API routes and health check (already handled above)
    if (c.req.path.startsWith('/api') || c.req.path === '/health') {
      return next()
    }
    // Apply auth middleware to frontend routes
    return authMiddleware(c, next)
  })
}

// Serve static assets (Vite build output)
// This will be used in production
// In development, @hono/vite-dev-server handles static assets
if (process.env.NODE_ENV === 'production') {
  // Dynamically import the appropriate serveStatic adapter based on runtime
  // This avoids loading Bun-specific code when running in Node.js (Vite dev server)
  const getServeStatic = async () => {
    if (isBun) {
      // Bun runtime - use Bun-specific adapter
      const bunModule = await import('hono/bun')
      return bunModule.serveStatic
    } else {
      // Node.js runtime - use Node.js adapter
      const nodeModule = await import('@hono/node-server/serve-static')
      return nodeModule.serveStatic
    }
  }
  
  // Initialize serveStatic lazily (cached after first load)
  let serveStaticFn: Awaited<ReturnType<typeof getServeStatic>> | null = null
  const getServeStaticFn = async () => {
    if (!serveStaticFn) {
      serveStaticFn = await getServeStatic()
    }
    return serveStaticFn
  }
  
  // Use absolute path to dist directory (relative to project root)
  // When running from dist/backend/server.js, the working directory is still the project root
  const distPath = path.resolve(process.cwd(), 'dist')
  
  // Cache the static middleware instance to avoid recreating on every request
  let cachedStaticMiddleware: ((c: any, next: any) => Promise<any>) | null = null
  
  // Helper to create static file middleware (lazy-loads serveStatic on first use)
  const createStaticMiddleware = async (c: any, next: any) => {
    if (!cachedStaticMiddleware) {
      const serveStatic = await getServeStaticFn()
      cachedStaticMiddleware = serveStatic({ root: distPath })
    }
    return cachedStaticMiddleware(c, next)
  }
  
  // Serve static files first (assets, JS, CSS, etc.)
  // Note: serveStatic will be initialized when these routes are first accessed
  app.use('/assets/*', createStaticMiddleware)
  app.use('/*.js', createStaticMiddleware)
  app.use('/*.css', createStaticMiddleware)
  app.use('/*.png', createStaticMiddleware)
  app.use('/*.jpg', createStaticMiddleware)
  app.use('/*.svg', createStaticMiddleware)
  app.use('/*.ico', createStaticMiddleware)
  app.use('/*.json', createStaticMiddleware)
  app.use('/favicon.png', createStaticMiddleware)
  
  // SPA fallback: serve index.html for all non-API, non-static routes
  // This allows React Router to handle client-side routing
  app.get('/*', async (c) => {
    // Skip API routes and health check (already handled above)
    if (c.req.path.startsWith('/api') || c.req.path === '/health') {
      return c.notFound()
    }
    
    // Serve index.html for all frontend routes (SPA fallback)
    const indexPath = path.join(distPath, 'index.html')
    try {
      // Use Bun.file() if available, otherwise use Node.js fs
      const indexContent = isBun
        ? await Bun.file(indexPath).text()
        : await readFile(indexPath, 'utf-8')
      return c.html(indexContent)
    } catch (error) {
      console.error('Failed to serve index.html:', error)
      return c.notFound()
    }
  })
}

// Error handler
app.onError(errorHandler)

// For development, this is handled by @hono/vite-dev-server
// For production, use Bun's built-in server:
export default {
  port: parseInt(process.env.PORT || '3456', 10),
  fetch: app.fetch,
}
