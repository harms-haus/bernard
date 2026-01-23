# Next.js → React Migration Plan

## Executive Summary

This plan outlines migrating Bernard core service from **Next.js 15** to a **pure React SPA with Vite**, while maintaining all API gateway functionality. This involves:

1. **Frontend migration**: App Router → React Router v7
2. **API migration**: Next.js API routes → Bun/Node.js server (Hono)
3. **Infrastructure migration**: Middleware, rewrites, headers → application code
4. **Build system migration**: Next.js → Vite

---

## Phase 0: Pre-Migration Assessment

### Current Architecture Analysis

**Next.js Features Being Used:**

| Feature | Usage | Impact |
|---------|-------|--------|
| **App Router** | Route groups `(dashboard)`, layouts, page.tsx | High - Core routing system |
| **API Routes** | 60+ endpoints in `/app/api/*` | Critical - All backend logic |
| **Middleware** | Auth protection for 10+ routes | Critical - Security |
| **Navigation Hooks** | `useRouter`, `useSearchParams`, `usePathname` | High - Navigation |
| **Server Components** | Layouts with `"use client"` | Medium - Can be client-only |
| **Next.js Config** | Webpack, rewrites, headers, server actions | High - Infrastructure |
| **Metadata API** | SEO metadata in layouts | Low - SPA doesn't need |
| **Image Optimization** | Not detected (no imports found) | None |

**API Route Categories:**
- **Proxy routes**: LangGraph SDK endpoints (proxied to port 2024)
- **Auth routes**: Better-Auth session management
- **Admin routes**: Service management, users, jobs
- **OpenAI-compatible**: `/v1/chat/completions`, `/v1/audio/*`
- **Streaming**: SSE endpoints for chat, jobs, health, threads
- **Redis-backed**: Thread checkpoints/history with ownership checks

**Dependencies to Replace:**
- ❌ `next` (entire framework)
- ❌ `eslint-config-next`
- ✅ Keep: `react`, `react-dom`, all other dependencies

**Next.js Config Behaviors to Preserve:**
- Headers for streaming/CORS on specific API paths (SSE caching/`X-Accel-Buffering`)
- Rewrites for external service proxies (`/api/runs`, `/api/v1/audio/*`, `/api/store`)
- Edge middleware behavior (cookie-only auth gate, admin role verified elsewhere)
- Webpack warnings suppression (`exprContextCritical=false`)
- Client fallback for Node built-ins (`fs/net/tls/crypto`)
- `reactStrictMode`, `poweredByHeader: false`, `serverActions.bodySizeLimit`

---

## Phase 1: Backend Server Setup (NEW)

### 1.1 Choose Backend Framework

**Hono with Vite integration** (unified dev server)

```bash
# Install Hono with Vite dev server
cd core
bun add hono @hono/vite-dev-server
```

**Why @hono/vite-dev-server:**
- Unified development experience (frontend + backend on same port)
- No port conflicts
- Hot module replacement for both client and server code
- Production: Hono standalone, Vite static assets served from Hono

### 1.2 Create Backend Server Structure

```
core/
├── backend/
│   ├── server.ts              # Main entry point
│   ├── routes/                # All API routes
│   │   ├── index.ts          # Route registry
│   │   ├── auth/             # Auth endpoints
│   │   ├── threads/          # LangGraph proxy
│   │   ├── v1/               # OpenAI-compatible
│   │   ├── admin/            # Admin endpoints
│   │   └── services/         # Service management
│   ├── middleware/            # Auth, CORS, error handling
│   │   ├── auth.ts           # Auth middleware
│   │   ├── cors.ts           # CORS middleware
│   │   └── errorHandler.ts   # Global error handler
│   ├── utils/
│   │   └── proxy.ts          # Service proxy utilities
│   └── config.ts             # Server config
```

### 1.3 Implement Core Server (server.ts)

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { authMiddleware } from './middleware/auth'
import { errorHandler } from './middleware/errorHandler'
import routes from './routes'

const app = new Hono()

// Global middleware
app.use('*', logger())

// CORS configuration with allowlist
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3456').split(',').map(s => s.trim())
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return false
    return allowedOrigins.includes(origin) ? origin : false
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}))

// Apply routes
app.route('/api', routes)

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

// Serve static assets (Vite build output)
app.use('/*', serveStatic({ root: './dist' }))

// For development, this is handled by @hono/vite-dev-server
// For production, use Bun's built-in server:
export default {
  port: 3456,
  fetch: app.fetch,
}
```
```

### 1.4 Implement Auth Middleware

```typescript
// backend/middleware/auth.ts
import { Context, Next } from 'hono'
import { getSessionCookie } from 'better-auth/cookies'

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
  const requiresAuth = protectedRoutes.some(route => pathname.startsWith(route))
  const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route))

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
      const session = await getSession(c.req.raw)
      if (!session || session.user?.role !== 'admin') {
        return c.redirect('/403', 403)
      }
    } catch (error) {
      // Session verification failed - deny access
      return c.redirect('/403', 403)
    }
  }

  // Session cookie exists and route is not admin-protected - allow access
  return next()
}
```

**Note**: Admin routes now perform server-side role verification by checking the user's role from the session. This ensures security at the middleware level rather than relying on client-side checks.

---

## Phase 2: API Route Migration

### 2.1 Migration Strategy

**Approach: Convert Next.js API routes to Hono routes**

| Next.js Pattern | Hono Pattern |
|----------------|--------------|
| `export async function GET(request: NextRequest)` | `app.get('/path', handler)` |
| `request.json()` | `await c.req.json()` |
| `new Response(...)` | `c.json(...)`, `c.text(...)` |
| `headers()` from next/headers | `c.req.header()` |
| `cookies()` from next/headers | `c.req.cookie()`, `c.cookie()` |

### 2.1.1 Important: API Routes vs. Rewrites

**Next.js API Routes** (require Hono route handlers with logic):
- `/api/threads/*` - Calls `proxyToLangGraph()` helper, injects userId/userRole into requests; includes custom Redis-backed routes
- `/api/assistants/*` - Calls `proxyToLangGraph()` helper (NOT a rewrite)
- `/api/bernard/stream` - Custom SSE handler
- `/api/info` - Proxies to LangGraph `/info` endpoint
- `/api/auth/*` - Session management, Better-Auth integration
- `/api/admin/*` - Service management, user admin
- `/api/v1/chat/completions` - OpenAI-compatible chat endpoint
- `/api/v1/models` - OpenAI-compatible models endpoint (GET + OPTIONS)
- `/api/settings/*` - Settings management (hand-implemented, not a rewrite)
- `/api/tokens/*`, `/api/tasks/*`, `/api/users/*` - User resources
- `/api/status/*` - Service health checks with conditional auth (guests can see basic status, auth required for service details)
- `/api/info` - Server info endpoint (proxied to LangGraph)
- `/api/services/*` - Service management via API factory helpers

**Next.js Rewrites** (become simple proxy routes):
- `/api/runs/*` → Proxy to `http://127.0.0.1:2024/runs/*` (transparent)
- `/api/v1/audio/transcriptions` → Proxy to `http://127.0.0.1:8870/inference` (transparent)
- `/api/v1/audio/speech` → Proxy to `http://127.0.0.1:8880/v1/audio/speech` (transparent)
- `/api/store/*` → Proxy to `http://127.0.0.1:2024/store/*` (transparent)

**Key Difference**: API routes have server-side logic (auth, data transformation, middleware). Rewrites are transparent proxies with no server-side modifications.

### 2.2 Migrate Threads API Routes (Handled Proxy with Logic)

**Note**: Threads routes require userId injection and session validation. These are NOT simple rewrites.

```typescript
// backend/routes/threads.ts
import { Hono } from 'hono'
import { proxyToLangGraph } from '@/lib/langgraph/proxy' // Reuse existing utility
import { getSession } from '@/lib/auth/server-helpers'

const threadsRoutes = new Hono()

// GET /api/threads - List threads (requires userId filtering)
threadsRoutes.get('/', async (c) => {
  const session = await getSession()
  const userId = session?.user?.id
  const { searchParams } = new URL(c.req.url)

  // Remove any existing user_id from searchParams to prevent authorization bypass
  const sanitizedParams = new URLSearchParams(searchParams)
  sanitizedParams.delete("user_id")

  const query = sanitizedParams.toString()
  const path = `/threads${query ? `?${query}&user_id=${userId}` : `?user_id=${userId}`}`

  return proxyToLangGraph(c, path)
})

// POST /api/threads - Create thread (inject userId into metadata)
threadsRoutes.post('/', async (c) => {
  const session = await getSession()
  const userId = session?.user?.id

  // Pass userId to inject into request body for thread creation
  return proxyToLangGraph(c, '/threads', { userId })
})

// All other thread routes - transparent proxy with userId injection
threadsRoutes.all('/:threadId/*', async (c) => {
  const session = await getSession()
  const userId = session?.user?.id
  const userRole = session?.user?.role || 'guest'

  const path = c.req.path.replace('/api/threads', '/threads')
  return proxyToLangGraph(c, path, { userId, userRole })
})

export default threadsRoutes
```

### 2.2.1 Migrate Transparent Rewrite Routes (Simple Proxy)

**Note**: These routes are simple proxies - no logic, no user injection.

```typescript
// backend/routes/proxy.ts
import { Hono } from 'hono'
import { proxyRequest } from '../utils/proxy'

const proxyRoutes = new Hono()

// Transparent proxies (formerly Next.js rewrites)
// Note: /api/assistants/* is handled by assistantsRoutes with logic, not here
proxyRoutes.all('/runs/:path*', async (c) => {
  const path = c.req.path.replace(/^\/api\/runs/, '/runs')
  return proxyRequest(c, 'http://127.0.0.1:2024' + path)
})

export default proxyRoutes
```

### 2.3 Migrate Auth Routes

```typescript
// backend/routes/auth.ts
import { Hono } from 'hono'
import { auth } from '@/lib/auth/auth'

const authRoutes = new Hono()

// Better-Auth integration - use Hono middleware
authRoutes.use('*', async (c, next) => {
  const session = await auth.api.getSession({
    headers: Object.fromEntries(c.req.raw.headers.entries()),
  })
  c.set('session', session)
  await next()
})

authRoutes.get('/session', async (c) => {
  const session = c.get('session')
  return c.json(session ? { user: session.user } : null)
})

authRoutes.post('/logout', async (c) => {
  const session = c.get('session')
  if (session) {
    await auth.api.signOut({
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    })
  }
  return c.json({ success: true })
})

// Better-Auth API routes (all Better-Auth endpoints)
authRoutes.all('/*', async (c) => {
  const response = await auth.handler(c.req.raw)
  return c.body(response.body, response.status as number, response.headers as Headers)
})

export default authRoutes
```

**Note**: Better-Auth provides its own API handler. The Hono middleware extracts session for internal use, then passes all auth requests directly to Better-Auth.
**Also migrate**: `/api/auth/get-session` and `/api/auth/logout` handlers that exist outside the Better-Auth catch-all.

### 2.4 Implement Proxy Utility with SSE Support

```typescript
// backend/utils/proxy.ts
import type { Context } from 'hono'

// RFC-2616 hop-by-hop headers that must not be forwarded
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]

export interface ProxyOptions {
  streaming?: boolean
  timeout?: number
  body?: unknown
}

export async function proxyRequest(
  c: Context,
  targetUrl: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const { streaming = false, timeout = 30000, body } = options
  const url = new URL(targetUrl)

  // Forward query params
  const queryParams = c.req.query()
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value)
    }
  })

  const headers = new Headers()
  // Forward relevant headers
  if (c.req.header('authorization')) {
    headers.set('authorization', c.req.header('authorization')!)
  }
  if (c.req.header('content-type')) {
    headers.set('content-type', c.req.header('content-type')!)
  }
  if (c.req.header('x-api-key')) {
    headers.set('x-api-key', c.req.header('x-api-key')!)
  }

  // Read request body safely
  let requestBody: BodyInit | undefined
  const contentType = c.req.header('content-type')
  if (body !== undefined) {
    requestBody = JSON.stringify(body)
    headers.set('content-type', 'application/json')
  } else if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const bodyText = await c.req.text()
    if (bodyText) {
      requestBody = bodyText
      if (contentType) {
        headers.set('content-type', contentType)
      }
    }
  }

  // Add request timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url.toString(), {
      method: c.req.method,
      headers,
      body: requestBody,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Handle SSE streaming responses
    if (streaming && response.body) {
      // SSE-specific headers
      const streamHeaders = new Headers()
      streamHeaders.set('Content-Type', 'text/event-stream')
      streamHeaders.set('Cache-Control', 'no-cache')
      streamHeaders.set('Connection', 'keep-alive')
      streamHeaders.set('X-Accel-Buffering', 'no')
      streamHeaders.set('Access-Control-Allow-Origin', '*')
      streamHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      streamHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')

      // Copy relevant non-hop-by-hop headers
      response.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
          streamHeaders.set(key, value)
        }
      })

      // Stream response body using Hono's streaming
      return c.body(response.body, 200, { headers: Object.fromEntries(streamHeaders) })
    }

    // Copy allowed headers from response (excluding hop-by-hop headers)
    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    })

    // Forward response
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    clearTimeout(timeoutId)
    // Return controlled error response
    console.error('Proxy request failed:', error)
    return new Response(
      JSON.stringify({ error: 'Proxy request failed', message: error instanceof Error ? error.message : String(error) }),
      {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}
```

**Important**: For SSE endpoints (e.g., `/api/bernard/stream`, `/api/health/stream`, `/api/admin/jobs/stream`), pass `streaming: true` option when calling `proxyRequest()`. This ensures proper SSE headers are set and response body is streamed without buffering.

### 2.5 Migrate Additional API Routes

#### 2.5.1 Task Management Routes

Port the existing Next.js handlers for `/api/tasks` and `/api/tasks/[id]` (GET/POST/DELETE) without introducing placeholder stubs.

#### 2.5.2 Token Management Routes

Port the existing Next.js handlers for `/api/tokens` and `/api/tokens/[id]` (admin-only, GET/POST/PATCH/DELETE).

#### 2.5.3 User Management Routes

Port the existing Next.js handlers for `/api/users` and `/api/users/[id]` (admin-only, GET/POST/PATCH/DELETE + reset).

#### 2.5.4 Assistant Management Routes

**Note**: These are **API routes** using `proxyToLangGraph()` helper, not simple rewrites. They maintain the proxy utility but may have auth requirements.

```typescript
// backend/routes/assistants.ts
import { Hono } from 'hono'
import { proxyToLangGraph } from '@/lib/langgraph/proxy' // Reuse existing utility

const assistantsRoutes = new Hono()

// List assistants
assistantsRoutes.get('/', async (c) => {
  const { searchParams } = new URL(c.req.url)
  const query = searchParams.toString()
  const path = `/assistants${query ? `?${query}` : ''}`
  return proxyToLangGraph(c, path)
})

// Get assistant details
assistantsRoutes.get('/:assistantId', async (c) => {
  const { assistantId } = c.req.param()
  const path = `/assistants/${assistantId}`
  return proxyToLangGraph(c, path)
})

// Search assistants
assistantsRoutes.post('/search', async (c) => {
  return proxyToLangGraph(c, '/assistants/search')
})

export default assistantsRoutes
```

#### 2.5.4.1 Route Registry (routes/index.ts)

**Important**: Mount proxyRoutes at `/api` prefix so all transparent proxy handlers are reached. The assistantsRoutes handles `/api/assistants/*` with logic, so it should be mounted separately.

```typescript
// backend/routes/index.ts
import { Hono } from 'hono'
import authRoutes from './auth'
import threadsRoutes from './threads'
import assistantsRoutes from './assistants'
import proxyRoutes from './proxy'
import v1Routes from './v1'
import adminRoutes from './admin'
import servicesRoutes from './services'
import statusRoutes from './status'
import infoRoutes from './info'

const routes = new Hono()

// Mount all route modules
routes.route('/auth', authRoutes)
routes.route('/threads', threadsRoutes)
routes.route('/assistants', assistantsRoutes)  // Handles /api/assistants/* with logic
routes.route('/runs', proxyRoutes)  // Handles /api/runs/* transparent proxy
routes.route('/v1', v1Routes)
routes.route('/admin', adminRoutes)
routes.route('/services', servicesRoutes)
routes.route('/status', statusRoutes)
routes.route('/info', infoRoutes)

export default routes
```

**Note**: proxyRoutes only contains `/runs/:path*` handler (assistants removed). When mounted at `/runs`, it handles `/api/runs/*` requests. assistantsRoutes is mounted separately at `/assistants` to handle `/api/assistants/*` with proper logic.

#### 2.5.5 Admin Jobs Routes

```typescript
// backend/routes/admin/jobs.ts
import { Hono } from 'hono'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { getServiceManager } from '@/lib/services/ServiceManager'

const jobsRoutes = new Hono()

// List all jobs
jobsRoutes.get('/', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const manager = getServiceManager()
  const jobs = await manager.getAllJobs()
  return c.json({ jobs })
})

// Get job statistics
jobsRoutes.get('/stats', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const manager = getServiceManager()
  const stats = await manager.getJobStats()
  return c.json(stats)
})

// Stream job updates
// Implement SSE stream using BullMQ QueueEvents (see existing Next.js handler)

// Get job details
jobsRoutes.get('/:jobId', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const { jobId } = c.req.param()
  const manager = getServiceManager()
  const job = await manager.getJob(jobId)
  return c.json({ job })
})

// Cancel job
jobsRoutes.post('/:jobId/cancel', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const { jobId } = c.req.param()
  const manager = getServiceManager()
  await manager.cancelJob(jobId)
  return c.json({ success: true })
})

// Rerun job
jobsRoutes.post('/:jobId/rerun', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const { jobId } = c.req.param()
  const manager = getServiceManager()
  await manager.rerunJob(jobId)
  return c.json({ success: true })
})

// Delete job
jobsRoutes.delete('/:jobId/delete', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const { jobId } = c.req.param()
  const manager = getServiceManager()
  await manager.deleteJob(jobId)
  return c.json({ success: true })
})

export default jobsRoutes
```

#### 2.5.6 Admin Providers Routes

```typescript
// backend/routes/admin/providers.ts
import { Hono } from 'hono'
import { requireAdmin } from '@/lib/auth/server-helpers'

const providersRoutes = new Hono()

// List providers
providersRoutes.get('/', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing settings-backed provider listing
  return c.json({ providers: [] })
})

// Get provider details
providersRoutes.get('/:id', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const { id } = c.req.param()
  // Port existing provider detail logic
  return c.json({ provider: null })
})

// Get provider models
providersRoutes.get('/:id/models', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const { id } = c.req.param()
  // Port existing provider models logic
  return c.json({ models: [] })
})

// Test provider
providersRoutes.post('/:id/test', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const { id } = c.req.param()
  // Port existing provider test logic
  return c.json({ success: true, result: {} })
})

export default providersRoutes
```

#### 2.5.7 Admin Service Test Routes

```typescript
// backend/routes/admin/services-test.ts
import { Hono } from 'hono'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { proxyRequest } from '../../utils/proxy'

const servicesTestRoutes = new Hono()

// Test Home Assistant connection
servicesTestRoutes.post('/home-assistant', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing Home Assistant test logic
  return c.json({ success: true, status: 'ok' })
})

// Test Overseerr connection
servicesTestRoutes.post('/overseerr', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing Overseerr test logic
  return c.json({ success: true, status: 'ok' })
})

// Test Plex connection
servicesTestRoutes.post('/plex', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing Plex test logic
  return c.json({ success: true, status: 'ok' })
})

// Test TTS service
servicesTestRoutes.post('/tts', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const response = await fetch('http://127.0.0.1:8880/health', {
    method: 'GET',
    signal: AbortSignal.timeout(2000),
  })
  return c.json({ success: response.ok, status: response.ok ? 'ok' : 'error' })
})

// Test STT service
servicesTestRoutes.post('/stt', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const response = await fetch('http://127.0.0.1:8870/health', {
    method: 'GET',
    signal: AbortSignal.timeout(2000),
  })
  return c.json({ success: response.ok, status: response.ok ? 'ok' : 'error' })
})

export default servicesTestRoutes
```

#### 2.5.8 Admin System Routes

```typescript
// backend/routes/admin/system.ts
import { Hono } from 'hono'
import { requireAdmin } from '@/lib/auth/server-helpers'

const systemRoutes = new Hono()

// Get system limits
systemRoutes.get('/limits', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing limits settings logic
  return c.json({ limits: {} })
})

// Get backups
systemRoutes.get('/backups', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing backups listing logic
  return c.json({ backups: [] })
})

// Get OAuth configuration
systemRoutes.get('/oauth', async (c) => {
  const session = await requireAdmin()
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing OAuth config logic
  return c.json({ oauth: {} })
})

export default systemRoutes
```

#### 2.5.9 Health & Status Routes

```typescript
// backend/routes/health.ts
import { Hono } from 'hono'

const healthRoutes = new Hono()

// Health check endpoint
healthRoutes.get('/', (c) => {
  return c.json({ status: 'ok' })
})

// Health check endpoint
healthRoutes.get('/ok', (c) => {
  return c.json({ status: 'ok' })
})

// Readiness check
healthRoutes.get('/ready', (c) => {
  // Port existing readiness checks (Redis, Bernard agent, etc.)
  return c.json({ status: 'ready' })
})

// Stream health updates
healthRoutes.get('/stream', async (c) => {
  // Port existing SSE health stream logic
  return streamHealth(c)
})

export default healthRoutes
```

**Note**: Implement `streamHealth()` by porting the existing Next.js `/api/health/stream` SSE handler (keepalive + headers).

```typescript
// backend/routes/info.ts
import { Hono } from 'hono'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

const infoRoutes = new Hono()

// Server info endpoint
infoRoutes.get('/', async (c) => {
  return proxyToLangGraph(c, '/info')
})

export default infoRoutes
```

#### 2.5.10 Status & Info Routes (Complex Auth Patterns)

**Note**: `/api/status` has special auth semantics - guests get basic status, authenticated users see service details.

```typescript
// backend/routes/status.ts
import { Hono } from 'hono'
import { denyGuest } from '@/lib/auth/server-helpers'
import { logger } from '@/lib/logging/logger'
import Redis from 'ioredis'

const statusRoutes = new Hono()

statusRoutes.get('/', async (c) => {
  const { searchParams } = new URL(c.req.url)
  const includeServices = searchParams.get('services') === 'true'
  const includeLogs = searchParams.get('logs') === 'true'

  if (includeServices) {
    const session = await denyGuest()
    if (!session) {
      return c.json({ error: 'Authentication required' }, 401)
    }
  }

  // ... (service health checks for Redis, Bernard Agent, Whisper, Kokoro, etc.)
  // Full implementation mirrors existing Next.js route (261 lines)
})

export default statusRoutes
```

#### 2.5.11 Services Management Routes (API Factory)

**Note**: These routes use helper functions from `@/lib/api/factory` for service management.

```typescript
// backend/routes/services.ts
import { Hono } from 'hono'
import { requireAuth } from '@/lib/auth/server-helpers'
import { getServiceManager } from '@/lib/api/factory'
import { ok, error } from '@/lib/api/response'

const servicesRoutes = new Hono()

servicesRoutes.get('/', async (c) => {
  const session = await requireAuth()
  if (!session) return c.json({ error: 'Session required' }, 401)

  const manager = getServiceManager()
  const statuses = await manager.getAllStatus()
  return c.json(ok(statuses))
})

servicesRoutes.get('/:service', async (c) => {
  const session = await requireAuth()
  if (!session) return error('Session required', 401)

  const { service } = c.req.param()
  return handleGetService(service)
})

servicesRoutes.post('/:service', async (c) => {
  const session = await requireAuth()
  if (!session) return error('Session required', 401)

  const { service } = c.req.param()
  const body = await c.req.json().catch(() => ({}))
  return handleServiceCommand(service, body)
})

export default servicesRoutes
```

#### 2.5.12 Thread Streaming Routes
#### 2.5.13 Thread Checkpoints & History (Redis-backed)

**Important**: These routes are not transparent proxies. They read Redis, verify thread ownership, and enrich responses.

- `/api/threads/[threadId]/checkpoints` - Redis `SCAN` over `checkpoint:${threadId}:*`, decode typed checkpoints, include parent info
- `/api/threads/[threadId]/history` - Proxy to LangGraph history and inject checkpoint data
- `/api/threads/[threadId]/auto-rename` - Custom handler (not a proxy)

#### 2.5.14 Bernard Stream (SSE)

**Important**: `/api/bernard/stream` runs the LangGraph stream directly and transforms events into SSE messages with tool calls and custom events. This is custom logic, not a proxy.

#### 2.5.15 API Info (LangGraph Proxy)

**Important**: `/api/info` proxies directly to LangGraph `/info` and is used by the SDK.

#### 2.5.16 OpenAI Models Endpoint

**Important**: `/api/v1/models` implements GET + OPTIONS with CORS headers and reads `langgraph.json` as fallback if the agent server is unavailable.

#### 2.5.17 Admin Jobs Stream (SSE)

**Important**: `/api/admin/jobs/stream` uses BullMQ `QueueEvents` and must keep SSE stream open with keepalives.


**Important**: Thread streaming endpoints must stream SSE chunks as they arrive. **DO NOT await for the call to complete before sending chunks** or aggregate messages. Forward each chunk immediately.

```typescript
// backend/routes/threads-streaming.ts
import { Hono } from 'hono'
import { getSession } from '@/lib/auth/server-helpers'
import { Client } from '@langchain/langgraph-sdk'

const client = new Client({
  apiUrl: process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024'
})

const streamingRoutes = new Hono()

// GET /api/threads/[threadId]/runs/stream - Stream thread run events
streamingRoutes.get('/:threadId/runs/stream', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession()
  const userRole = session?.user?.role ?? 'guest'

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let doneSent = false
      try {
        const runStream = client.runs.stream(threadId, 'bernard_agent', {
          input: { userRole },
          streamMode: ['messages', 'updates', 'custom'] as const,
        } as any)

        for await (const chunk of runStream) {
          // IMPORTANT: Stream each chunk immediately, don't aggregate
          const eventType = String(chunk.event || '')
          if (eventType === 'messages/partial' || eventType === 'updates' || eventType === 'custom') {
            const sseData = JSON.stringify({
              event: eventType,
              data: chunk.data,
            })
            controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${sseData}\n\n`))
          }

          if (eventType === 'done' || chunk.status === 'done') {
            controller.enqueue(encoder.encode(`event: done\ndata: {"event":"done"}\n\n`))
            doneSent = true
            break
          }
        }

        if (!doneSent) {
          controller.enqueue(encoder.encode(`event: done\ndata: {"event":"done"}\n\n`))
        }
      } finally {
        controller.close()
      }
    }
  })

  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
})

// GET /api/threads/[threadId]/runs/[runId]/stream - Stream specific run
streamingRoutes.get('/:threadId/runs/:runId/stream', async (c) => {
  const { threadId, runId } = c.req.param()
  // Similar streaming implementation, filtered by runId
  // ... (same pattern as above)
})

export default streamingRoutes
```

---

## Phase 3: Frontend Migration (Next.js → React)

### 3.1 Initialize Vite Project

```bash
cd core
# Remove Next.js-specific files
rm -rf .next
rm next.config.mjs
rm -f next-env.d.ts

# Install Vite
bun add -D vite @vitejs/plugin-react

# Create vite.config.ts
```

#### 2.5.13 Route Registry

```typescript
// backend/routes/index.ts
import { Hono } from 'hono'
import threadsRoutes from './threads'
import authRoutes from './auth'
import proxyRoutes from './proxy'
import assistantsRoutes from './assistants'
import v1Routes from './v1'
import adminRoutes from './admin'
import servicesRoutes from './services'
import statusRoutes from './status'
import infoRoutes from './info'
import streamingRoutes from './threads-streaming'

const routes = new Hono()

// Mount all route groups
// NOTE: /admin routes include all admin sub-routes (jobs, providers, services/test, system)
routes.route('/threads', threadsRoutes)
routes.route('/auth', authRoutes)
routes.route('/runs', proxyRoutes)
routes.route('/assistants', assistantsRoutes)
routes.route('/v1', v1Routes)
routes.route('/admin', adminRoutes) // This mounts all /admin/* routes
routes.route('/services', servicesRoutes)
routes.route('/status', statusRoutes)
routes.route('/', infoRoutes)
routes.route('/threads-streaming', streamingRoutes)

export default routes
```

---

### 3.2 Create Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { honoDevServer } from '@hono/vite-dev-server'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    // Hono dev server for unified frontend + backend
    honoDevServer({
      entry: 'backend/server.ts',
    }),
  ],
  css: {
    postcss: './postcss.config.js', // Required for Tailwind CSS processing
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

**Note**: During development, @hono/vite-dev-server runs both Vite and Hono together on the same port (3456). No separate backend process needed. Production builds serve static assets from Hono using `serveStatic()`.

### 3.3 Migrate Routing (App Router → React Router)

**Before (Next.js):**
```typescript
// src/app/(dashboard)/bernard/chat/page.tsx
"use client"
export default function Chat() { ... }
```

**After (React Router v7):**
```typescript
// src/pages/Chat.tsx
export function Chat() { ... }

// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Chat } from './pages/Chat'
import { Login } from './pages/Login'
import { VerifyAdmin } from './pages/VerifyAdmin'
import { Logout } from './pages/Logout'
import { AdminPanel } from './pages/AdminPanel'
import { Models } from './pages/Models'
import { Services } from './pages/Services'
import { Users } from './pages/Users'
import { Jobs } from './pages/Jobs'
import { JobDetail } from './pages/JobDetail'
import { StatusPage } from './pages/StatusPage'
import { Forbidden } from './pages/Forbidden'
import { UserPanel } from './pages/UserPanel'
import { Profile } from './pages/Profile'
import { Keys } from './pages/Keys'
import { Tasks } from './pages/Tasks'
import { TaskDetail } from './pages/TaskDetail'
import { About } from './pages/About'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Public routes (no auth required) */}
          <Route path="auth/login" element={<Login />} />
          <Route path="auth/verify-admin" element={<VerifyAdmin />} />
          <Route path="auth/logout" element={<Logout />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="403" element={<Forbidden />} />

          {/* Protected routes (require auth) */}
          <Route path="bernard/chat" element={<Chat />} />
          <Route path="bernard/profile" element={<Profile />} />
          <Route path="bernard/keys" element={<Keys />} />
          <Route path="bernard/user" element={<UserPanel />} />
          <Route path="bernard/user/tokens" element={<Keys />} />
          <Route path="bernard/user/profile" element={<Profile />} />
          <Route path="bernard/tasks" element={<Tasks />} />
          <Route path="bernard/tasks/:id" element={<TaskDetail />} />
          <Route path="bernard/about" element={<About />} />

          {/* Admin routes (require admin role) */}
          {/* Admin routes (require admin role - checked in AdminLayout component) */}
          <Route path="bernard/admin" element={<AdminPanel />} />
          <Route path="bernard/admin/models" element={<Models />} />
          <Route path="bernard/admin/services" element={<Services />} />
          <Route path="bernard/admin/users" element={<Users />} />
          <Route path="bernard/admin/jobs" element={<Jobs />} />
          <Route path="bernard/admin/jobs/:jobId" element={<JobDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

**Note**: Ensure all route components exist. Public routes (`/auth/login`, `/status`, `/403`) must be accessible without authentication.

### 3.4 Migrate Navigation Hooks

**Create compatibility layer:**

```typescript
// src/lib/router/compat.ts
import {
  useSearchParams as useSearchParamsRR,
  useParams as useParamsRR,
  useLocation,
  useNavigate,
  Link as LinkRR
} from 'react-router-dom'

// UseSearchParams compatibility
export function useSearchParams() {
  const [rrSearchParams, rrSetSearchParams] = useSearchParamsRR()

  const setParams = (params: Record<string, string>) => {
    const newSearchParams = new URLSearchParams(rrSearchParams)
    Object.entries(params).forEach(([key, value]) => {
      newSearchParams.set(key, value)
    })
    rrSetSearchParams(newSearchParams)
  }

  return [rrSearchParams, setParams] as const
}

// UseRouter compatibility
export function useRouter() {
  const navigate = useNavigate()
  const location = useLocation()

  return {
    push: navigate,
    replace: navigate,
    pathname: location.pathname,
    query: Object.fromEntries(new URLSearchParams(location.search)),
  }
}

// Link compatibility
export const Link = LinkRR
```

**Update imports throughout codebase:**

```typescript
// Before:
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

// After:
import { useRouter, useSearchParams, Link } from '@/lib/router/compat'
```

### 3.5 Convert Layouts

```typescript
// src/app/layout.tsx → src/components/RootLayout.tsx
export function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
```

#### 3.5.1 Nested Layout Strategy

Next.js has nested layouts (dashboard → bernard → user/admin). React Router v7 supports nested routes.

**Approach: Nested Route Components with Outlet**

```typescript
// src/components/DashboardLayout.tsx
import { Outlet } from 'react-router-dom'

export function DashboardLayout() {
  return (
    <div className="dashboard-container">
      <Outlet />
    </div>
  )
}

// src/components/BernardLayout.tsx
import { Outlet } from 'react-router-dom'

export function BernardLayout() {
  return (
    <div className="bernard-container">
      <Outlet />
    </div>
  )
}

// src/components/UserLayout.tsx (CLIENT-SIDE LAYOUT)
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function UserLayout() {
  const { state: authState } = useAuth()

  // Client-side auth: redirect if not authenticated or guest
  if (!authState.loading && !authState.user) {
    // Use window.location for redirect (React Router handles this)
    return null
  }

  if (!authState.loading && authState.user?.role === 'guest') {
    return null
  }

  return (
    <div className="user-container">
      <Outlet />
    </div>
  )
}

// src/components/BernardUserLayout.tsx (SERVER-SIDE LAYOUT)
// Mirrors Next.js bernard/admin/layout.tsx server component pattern:
// - Uses getSession() server-side
// - Checks role server-side
// - Returns 403 if not admin
// This works in React Router via loader functions or component redirects

// src/components/AdminLayout.tsx
import { Outlet } from 'react-router-dom'

export function AdminLayout() {
  return (
    <div className="admin-container">
      <Outlet />
    </div>
  )
}
```

**Update App.tsx with Nested Routes:**

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { RootLayout } from './components/RootLayout'
import { DashboardLayout } from './components/DashboardLayout'
import { BernardLayout } from './components/BernardLayout'
import { UserLayout } from './components/UserLayout'
import { AdminLayout } from './components/AdminLayout'
// ... import page components

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout><Outlet /></RootLayout>}>
          <Route element={<DashboardLayout><Outlet /></DashboardLayout>}>
            {/* Public routes */}
            <Route path="auth/login" element={<Login />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="403" element={<Forbidden />} />

            {/* Protected bernard routes */}
            <Route element={<BernardLayout><Outlet /></BernardLayout>}>
              <Route path="bernard" element={<Dashboard />} />
              <Route path="bernard/chat" element={<Chat />} />
              <Route path="bernard/profile" element={<Profile />} />
              <Route path="bernard/keys" element={<Keys />} />
              <Route path="bernard/tasks" element={<Tasks />} />
              <Route path="bernard/tasks/:id" element={<TaskDetail />} />
              <Route path="bernard/about" element={<About />} />

              {/* User routes (CLIENT-SIDE auth via useAuth() hook) */}
              <Route path="bernard/user" element={<UserLayout><Outlet /></UserLayout>}>
                <Route index element={<UserPanel />} />
                <Route path="tokens" element={<Keys />} />
                <Route path="profile" element={<Profile />} />
              </Route>

              {/* Admin routes */}
              <Route path="bernard/admin" element={<AdminLayout><Outlet /></AdminLayout>}>
                <Route index element={<AdminPanel />} />
                <Route path="models" element={<Models />} />
                <Route path="services" element={<Services />} />
                <Route path="users" element={<Users />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="jobs/:jobId" element={<JobDetail />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

**Note**: Each layout wraps its children with `<Outlet />`, allowing nested routing.

**Auth Pattern Clarification:**
- Current Next.js middleware only checks cookie existence (Edge runtime), and admin role checks happen in layouts/server logic. Preserve this split in React: keep a lightweight route guard and perform role verification server-side in API handlers or loaders.

### 3.6 Migrate Environment Variables

```typescript
// Before:
process.env.NEXT_PUBLIC_APP_URL

// After:
import.meta.env.VITE_APP_URL
```

**Update .env:**
```env
# Before
NEXT_PUBLIC_APP_URL=http://localhost:3456
BETTER_AUTH_URL=http://localhost:3456

# After
VITE_APP_URL=http://localhost:3456
BETTER_AUTH_URL=http://localhost:3456
```

---

## Phase 4: Infrastructure Migration

### 4.1 Handle Webpack → Vite Migration

**Next.js Webpack Config to Migrate:**

The `next.config.mjs` has several webpack customizations that need Vite equivalents:

1. **Externalize worker_threads:**
```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      worker_threads: 'worker_threads',
    },
  },
})
```

2. **Suppress langchain warnings:**
```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['langchain/chat_models/universal'],
  },
})
```

3. **Server-side splitChunks:** Confirm server bundling does not regress behavior before removing the Next.js setting

4. **Client-side Node.js polyfills:**
```typescript
// vite.config.ts
export default defineConfig({
  define: {
    // Vite handles this automatically for most cases
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
  resolve: {
    alias: {
      // Ensure Node.js built-ins resolve correctly
      fs: 'empty-module', // Not used in client
      net: 'empty-module', // Not used in client
      tls: 'empty-module', // Not used in client
    },
  },
})
```

### 4.2 Migrate Headers Configuration

```typescript
// Next.js config headers → Hono middleware
// backend/middleware/cors.ts
import { cors } from 'hono/cors'

// CORS configuration with allowlist
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3456').split(',').map(s => s.trim())
export const corsConfig = cors({
  origin: (origin) => {
    if (!origin) return false
    return allowedOrigins.includes(origin) ? origin : false
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposeHeaders: ['Cache-Control', 'Pragma', 'Expires'],
})

export const noCacheHeaders = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}
```

### 4.2 Migrate Rewrites

**Rewrites become proxy routes:**

```typescript
// backend/routes/rewrite.ts
import { Hono } from 'hono'
import { proxyRequest } from '../utils/proxy'

const rewriteRoutes = new Hono()

rewriteRoutes.all('/v1/audio/transcriptions', async (c) => {
  return proxyRequest(c, 'http://127.0.0.1:8870/inference')
})

rewriteRoutes.all('/v1/audio/speech', async (c) => {
  return proxyRequest(c, 'http://127.0.0.1:8880/v1/audio/speech')
})

rewriteRoutes.all('/api/store/:path*', async (c) => {
  const path = c.req.path.replace('/api/store', '/store')
  return proxyRequest(c, 'http://127.0.0.1:2024' + path)
})

export default rewriteRoutes
```

**Note**: `/api/settings/:path*` is a self-rewrite in Next.js (no-op). It remains a local API route and does not become a proxy.

### 4.3 Update TypeScript Config
### 4.4 Update Route Handler Signatures

**Next.js 15 pattern** uses async params (`{ params }: { params: Promise<{...}> }`). Hono uses synchronous `c.req.param()`. Convert all dynamic routes accordingly.

### 4.5 Clean Up Next.js TS Artifacts

- Remove `next-env.d.ts` and any `.next/types` include patterns
- Remove `plugins: [{ name: "next" }]` from `tsconfig.json`
- Switch `jsx` to `"react-jsx"` (if not already)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "types": ["bun"],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Phase 5: Build & Deploy Configuration

### 5.1 Update Package Scripts

**Using @hono/vite-dev-server (unified dev server):**

```json
{
  "scripts": {
    "dev": "bunx vite",
    "build": "bunx vite build && bunx bun build backend/server.ts --outdir dist/backend --target bun",
    "start": "bun dist/backend/server.js",
    "preview": "bun run build && bun run start"
  }
}
```

**No concurrent package needed** - @hono/vite-dev-server handles both frontend and backend in one process.

### 5.2 Update Entry Points

```html
<!-- src/main.tsx -->
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bernard</title>
    <link rel="icon" href="/favicon.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Note**: Redis runs in Docker and is started separately. Core service (Hono + Vite) runs as a Bun process.

---

## Phase 6: Testing & Validation

### 6.1 Update Tests

**Vitest setup:**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 6.2 Mock React Router in Tests

```typescript
// vitest.setup.ts
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  BrowserRouter: ({ children }: any) => <div>{children}</div>,
}))
```

### 6.3 Migration Checklist

**Backend Migration:**
- [ ] All API routes migrated to Hono (threads, auth, proxy, v1, admin, tasks, tokens, users, assistants, health, info, bernard stream, checkpoints/history)
- [ ] Auth middleware working correctly with Better-Auth integration
- [ ] Proxy routes to services functional (runs, assistants, store, audio transcriptions/speech)
- [ ] Webpack config migrated to Vite (worker_threads externalization, langchain warnings suppressed, client fallbacks)
- [ ] Headers configuration migrated to CORS middleware
- [ ] Rewrites converted to proxy routes
- [ ] TypeScript configuration updated for Bun + Vite

**Frontend Migration:**
- [ ] All page components migrated to React Router (18+ pages)
- [ ] Nested layout structure implemented (Root → Dashboard → Bernard → User/Admin)
- [ ] Navigation hooks updated (useRouter, useSearchParams, useParams, Link)
- [ ] Environment variables migrated (NEXT_PUBLIC_ → VITE_)
- [ ] Vite config created with @hono/vite-dev-server integration
- [ ] index.html and main.tsx entry points created
- [ ] Root layout component created (HTML/body tags)

**Testing & Validation:**
- [ ] TypeScript compilation passing
- [ ] All tests passing (Vitest setup updated for React Router)
- [ ] Dev server running with @hono/vite-dev-server (unified on port 3456)
- [ ] Production build successful (vite build + Bun backend compile)
- [ ] Service health checks passing (all proxies functional)
- [ ] Auth flows tested (login, logout, protected routes, admin routes)
- [ ] SSE streaming endpoints tested (bernard/stream, health/stream, admin/jobs/stream, threads runs streaming)

**Cleanup:**
- [ ] Next.js dependencies removed (next, eslint-config-next)
- [ ] Next.js files removed (next.config.mjs, next-env.d.ts, .next/)
- [ ] App Router files migrated or removed (src/app/)

---

## Summary & Timeline

### Estimated Effort

| Phase | Estimated Time | Priority |
|-------|---------------|----------|
| Phase 0: Assessment | 0.5 day | ✅ Done |
| Phase 1: Backend Setup | 3-4 days | Critical |
| Phase 2: API Migration | 8-10 days | Critical |
| Phase 3: Frontend Migration | 5-6 days | Critical |
| Phase 4: Infrastructure | 3-4 days | High |
| Phase 5: Build Config | 2-3 days | High |
| Phase 6: Testing | 4-5 days | Critical |
**Total: 24-30 days (5-6 weeks)**

### Migration Benefits

✅ **Performance**: Vite is 10-100x faster dev server, optimized production builds
✅ **Bundle Size**: Eliminate Next.js overhead (~200KB)
✅ **Flexibility**: Full control over backend, not constrained by Next.js
✅ **Simplicity**: One framework to learn (React) instead of React + Next.js
✅ **Compatibility**: Better with Bun runtime
✅ **Maintainability**: Clear separation of frontend/backend concerns

### Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing integrations | Thorough testing, parallel migration |
| Auth flow changes | Test with Better-Auth thoroughly |
| Service proxy complexity | Isolate and test proxy routes |
| Learning curve | Incremental migration, keep references |

---

## References

- **Current Project Structure**: `/core/src/app/` - App Router based
- **API Routes**: 60+ endpoints in `/core/src/app/api/`
- **Components**: 100+ React components in `/core/src/components/`
- **Tests**: Vitest setup already configured
- **Dependencies**: Check `core/package.json` for current packages

---

**Generated**: 2026-01-23
**Status**: Planning Phase - Not Started
