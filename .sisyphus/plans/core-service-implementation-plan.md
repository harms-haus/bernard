# Core Service Implementation Plan

## Executive Summary

Create a new `core` service using Next.js (App Router) that:
1. Starts first and replaces all `@scripts/` with TypeScript service manager
2. Publishes `/status` page with service status, uptime, commands (check/start/restart/stop/init)
3. Displays live logs (individual and combined views)
4. Replaces `proxy-api` by proxying all `/v1/`, `/api/`, `/bernard/`, LangGraph endpoints
5. Handles authentication (OAuth, admin key, API tokens) like proxy-api
6. Auto-starts all services on `npm run dev`
7. Eventually enables deletion of proxy-api and @scripts/ directories

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Phase 1: Project Initialization](#phase-1-project-initialization)
3. [Phase 2: Service Manager Implementation](#phase-2-service-manager-implementation)
4. [Phase 3: Status Dashboard](#phase-3-status-dashboard)
5. [Phase 4: Proxy Routes Migration](#phase-4-proxy-routes-migration)
6. [Phase 5: Live Log Streaming](#phase-5-live-log-streaming)
7. [Phase 6: Authentication](#phase-6-authentication)
8. [Phase 7: Auto-Start Integration](#phase-7-auto-start-integration)
9. [Phase 8: Testing & Validation](#phase-8-testing--validation)
10. [Phase 9: Cleanup](#phase-9-cleanup)
11. [Security Considerations](#security-considerations)
12. [Rollback Strategy](#rollback-strategy)

---

## Project Structure

```
core/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Route group for auth pages
│   │   ├── login/
│   │   │   └── page.tsx         # OAuth login page
│   │   └── layout.tsx          # Auth layout
│   ├── (dashboard)/             # Admin dashboard route group
│   │   ├── layout.tsx           # Dashboard layout with nav
│   │   ├── status/
│   │   │   └── page.tsx        # Main status dashboard
│   │   ├── logs/
│   │   │   ├── page.tsx        # Combined logs view
│   │   │   └── [service]/
│   │   │       └── page.tsx    # Individual service logs
│   │   └── services/
│   │       └── [service]/
│   │           ├── page.tsx    # Service details page
│   │           └── actions.ts  # Server actions for service control
│   ├── api/                     # API routes
│   │   ├── health/
│   │   │   └── route.ts       # Health check
│   │   ├── services/
│   │   │   ├── route.ts       # List all services
│   │   │   └── [service]/
│   │   │       ├── route.ts   # GET status, POST command
│   │   │       ├── status/
│   │   │       │   └── route.ts
│   │   │       ├── start/
│   │   │       │   └── route.ts
│   │   │       ├── stop/
│   │   │       │   └── route.ts
│   │   │       ├── restart/
│   │   │       │   └── route.ts
│   │   │       └── check/
│   │   │           └── route.ts
│   │   ├── logs/
│   │   │   └── stream/
│   │   │       └── route.ts   # SSE endpoint for live logs
│   │   ├── v1/                # OpenAI-compatible routes (proxy)
│   │   ├── api/               # Bernard API proxy
│   │   ├── bernard/           # Bernard UI/API proxy
│   │   ├── threads/           # LangGraph SDK proxy
│   │   ├── runs/              # LangGraph SDK proxy
│   │   ├── assistants/        # LangGraph SDK proxy
│   │   └── auth/              # Authentication routes
│   ├── layout.tsx             # Root layout
│   └── page.tsx              # Root page (redirect to /status)
├── lib/                       # Shared library code
│   ├── services/
│   │   ├── ServiceManager.ts  # Main service manager class
│   │   ├── ServiceConfig.ts   # Service definitions
│   │   ├── ProcessManager.ts  # Process spawn/kill/monitor
│   │   ├── HealthChecker.ts   # Health check logic
│   │   └── LogStreamer.ts    # Log file tailing/streaming
│   ├── auth/
│   │   ├── middleware.ts      # Next.js auth middleware
│   │   ├── session.ts         # Session management
│   │   └── stores.ts         # Auth stores (migrate from lib/shared/auth)
│   ├── config/
│   │   └── env.ts            # Environment variable validation
│   ├── logger.ts             # Pino logger setup
│   └── utils.ts              # Shared utilities
├── components/
│   ├── ui/                   # Radix UI components (from bernard-ui)
│   ├── dashboard/
│   │   ├── ServiceCard.tsx   # Service status card
│   │   ├── ServiceList.tsx   # All services grid
│   │   ├── LogViewer.tsx     # Live log viewer
│   │   └── CombinedLogs.tsx # Combined logs view
│   └── layout/
│       ├── Header.tsx        # Dashboard header
│       └── Sidebar.tsx       # Navigation sidebar
├── hooks/
│   ├── useServiceStatus.ts   # Real-time service status hook
│   ├── useLogStream.ts       # SSE log streaming hook
│   └── useAuth.ts           # Authentication hook
├── public/                   # Static assets
├── middleware.ts             # Next.js middleware (auth)
├── next.config.mjs          # Next.js config with rewrites
├── package.json
├── tsconfig.json
└── README.md
```

---

## Phase 1: Project Initialization

### 1.1 Create Next.js App Router Project

**Tasks:**
- [ ] Initialize Next.js 15+ with App Router in `core/` directory
- [ ] Configure TypeScript with strict mode
- [ ] Set up Tailwind CSS (reuse from bernard-ui)
- [ ] Install dependencies:
  - `next`, `react`, `react-dom`, `typescript`
  - `@radix-ui/*` components (copy from bernard-ui)
  - `pino`, `pino-pretty` (logging)
  - `ioredis` (Redis)
  - `zod` (validation)
  - `tail`, `chokidar` (log file watching)
  - `lucide-react` (icons)
  - `class-variance-authority`, `clsx`, `tailwind-merge` (styling)

### 1.2 Configure Path Aliases

**Tasks:**
- [ ] Set up TypeScript path aliases (`@/lib`, `@/components`, `@/hooks`)
- [ ] Configure Next.js to recognize path aliases
- [ ] Copy `.npmrc` from root if needed for `@shared` module

### 1.3 Environment Configuration

**Tasks:**
- [ ] Create `lib/config/env.ts` with Zod schema validation
- [ ] Load env vars from root `.env` file
- [ ] Define all required env vars:
  - `CORE_PORT` (default: 3456)
  - `REDIS_URL`
  - `ADMIN_API_KEY`
  - `OAUTH_GITHUB_*`, `OAUTH_GOOGLE_*`
  - Service URLs (BERNARD_API_URL, VLLM_URL, etc.)

**File:** `lib/config/env.ts`
```typescript
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3456'),
  HOST: z.string().default('0.0.0.0'),
  REDIS_URL: z.string().url(),
  ADMIN_API_KEY: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().default(604800),
  OAUTH_GITHUB_CLIENT_ID: z.string().optional(),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
  OAUTH_GITHUB_REDIRECT_URI: z.string().url().optional(),
  TZ: z.string().default('America/Chicago'),
})

export const env = envSchema.parse(process.env)
```

---

## Phase 2: Service Manager Implementation

### 2.1 Define Service Configuration

**File:** `lib/services/ServiceConfig.ts`

**Tasks:**
- [ ] Create service definitions matching bash scripts
- [ ] Define service metadata:
  - `id`: unique identifier (e.g., 'redis', 'vllm')
  - `name`: display name (e.g., 'REDIS', 'VLLM')
  - `port`: port number
  - `type`: 'docker' | 'node' | 'python' | 'cpp'
  - `directory`: relative path to service
  - `healthPath`: health check endpoint
  - `dependencies`: array of service IDs that must start first
  - `startupTimeout`: timeout in seconds
  - `color`: for UI display

**Example:**
```typescript
export const SERVICES = {
  redis: {
    id: 'redis',
    name: 'REDIS',
    port: 6379,
    type: 'docker',
    container: 'bernard-redis',
    image: 'redis/redis-stack-server:7.4.0-v0',
    healthCheck: 'redis-cli ping',
    dependencies: [],
    startupTimeout: 30,
  },
  bernardApi: {
    id: 'bernard-api',
    name: 'BERNARD-API',
    port: 8800,
    type: 'node',
    directory: 'services/bernard-api',
    script: 'tsx watch src/index.ts',
    healthPath: '/health',
    dependencies: ['redis'],
    startupTimeout: 20,
  },
  // ... etc for all services
} as const

export const SERVICE_START_ORDER = [
  'redis',
  'shared',
  'bernard-api',
  'proxy-api', // Will be removed after migration
  'bernard-agent',
  'bernard-ui',
  'vllm',
  'whisper',
  'kokoro',
]
```

### 2.2 Process Manager

**File:** `lib/services/ProcessManager.ts`

**Tasks:**
- [ ] Implement process spawning with child_process.spawn
- [ ] PID tracking: save PIDs to `logs/pids/{service}.pid`
- [ ] Process killing with graceful shutdown (SIGTERM → SIGKILL after 5s)
- [ ] Port-based process detection using `lsof`
- [ ] Support for different process types:
  - Docker containers (docker start/stop)
  - Node.js (tsx, npm)
  - Python (uvicorn, vllm)
  - C++ (whisper-server binary)

**Key Methods:**
```typescript
class ProcessManager {
  async start(service: ServiceConfig): Promise<{ pid: number, success: boolean }>
  async stop(service: ServiceConfig): Promise<boolean>
  async restart(service: ServiceConfig): Promise<boolean>
  async isRunning(service: ServiceConfig): Promise<boolean>
  async getPid(service: ServiceConfig): Promise<number | null>
  async killByPid(pid: number, graceful = true): Promise<void>
  async executeCommand(cmd: string, args: string[], options: SpawnOptions): Promise<ChildProcess>
}
```

### 2.3 Health Checker

**File:** `lib/services/HealthChecker.ts`

**Tasks:**
- [ ] Implement health check logic per service type
- [ ] Support HTTP health checks (fetch to /health)
- [ ] Support Docker health checks (docker exec redis-cli ping)
- [ ] Support port-based checks (lsof)
- [ ] Implement retry logic with configurable timeout
- [ ] Return detailed health status (up/down/starting/degraded)

**Key Methods:**
```typescript
class HealthChecker {
  async check(service: ServiceConfig): Promise<HealthStatus>
  async checkAll(): Promise<Map<string, HealthStatus>>
  async waitForHealthy(service: ServiceConfig, timeout: number): Promise<boolean>
}

interface HealthStatus {
  service: string
  status: 'up' | 'down' | 'starting' | 'degraded'
  lastChecked: Date
  error?: string
  uptime?: number // seconds
}
```

### 2.4 Service Manager (Orchestrator)

**File:** `lib/services/ServiceManager.ts`

**Tasks:**
- [ ] Implement startup orchestration in dependency order
- [ ] Run build checks before starting services
- [ ] Start services sequentially with health checks
- [ ] Track service status (started, stopped, starting, failed)
- [ ] Store uptime information
- [ ] Implement commands: check, init, clean, start, stop, restart
- [ ] Maintain service state in memory and optionally Redis

**Key Methods:**
```typescript
class ServiceManager {
  private services: Map<string, ManagedService>
  private startupSequence: string[]

  // Lifecycle commands
  async check(service?: string): Promise<CheckResult>
  async init(service?: string): Promise<void>
  async clean(service?: string): Promise<void>
  async start(service?: string): Promise<StartResult>
  async stop(service?: string): Promise<StopResult>
  async restart(service?: string): Promise<RestartResult>

  // Orchestration
  async startAll(): Promise<void>
  async stopAll(): Promise<void>
  async startDependencies(service: string): Promise<void>

  // Status
  async getStatus(service: string): Promise<ServiceStatus>
  async getAllStatus(): Promise<ServiceStatus[]>
  async getUptime(service: string): Promise<number | null>

  // Health checks
  async healthCheck(service: string): Promise<HealthStatus>
  async healthCheckAll(): Promise<Map<string, HealthStatus>>
}

interface ServiceStatus {
  id: string
  name: string
  port: number
  status: 'running' | 'stopped' | 'starting' | 'failed'
  uptime?: number
  lastStarted?: Date
  lastStopped?: Date
  health: 'healthy' | 'unhealthy' | 'unknown'
}
```

---

## Phase 3: Status Dashboard

### 3.1 API Routes for Service Status

**File:** `app/api/services/route.ts`

**Tasks:**
- [ ] GET endpoint: list all services with status
- [ ] Require admin authentication (session or admin key)
- [ ] Return service status, uptime, health
- [ ] Support filtering by service ID

### 3.2 Individual Service Control Routes

**File:** `app/api/services/[service]/route.ts`

**Tasks:**
- [ ] GET: get detailed service status
- [ ] POST: execute command (start/stop/restart/check)
- [ ] Validate service ID (whitelist)
- [ ] Require admin authentication
- [ ] Rate limiting (5 commands per minute per user)
- [ ] Audit logging

**File:** `app/api/services/[service]/actions.ts`

**Tasks:**
- [ ] Implement Server Actions for:
  - `startService(serviceId)`
  - `stopService(serviceId)`
  - `restartService(serviceId)`
  - `checkService(serviceId)`
- [ ] Add optimistic UI updates
- [ ] Error handling with user-friendly messages

### 3.3 Status Dashboard Page

**File:** `app/(dashboard)/status/page.tsx`

**Tasks:**
- [ ] Create grid layout of service cards
- [ ] Auto-refresh status every 3 seconds (or SSE for real-time)
- [ ] Show: service name, port, status, uptime, health
- [ ] Color-coded status indicators (green/yellow/red)
- [ ] Control buttons: Start/Stop/Restart
- [ ] Link to individual service details
- [ ] Link to combined logs view

### 3.4 Individual Service Page

**File:** `app/(dashboard)/services/[service]/page.tsx`

**Tasks:**
- [ ] Show detailed service information
- [ ] Display: name, port, type, directory, dependencies
- [ ] Show current status and uptime
- [ ] Show last health check result
- [ ] Large control buttons (Start/Stop/Restart)
- [ ] Show check results (type-check, lint, build)
- [ ] Link to service-specific logs
- [ ] Show recent log entries preview

---

## Phase 4: Proxy Routes Migration

### 4.1 Next.js Rewrites Configuration

**File:** `next.config.mjs`

**Tasks:**
- [ ] Configure rewrites for backward compatibility
- [ ] Map `/v1/*` → internal API route or direct proxy
- [ ] Map `/api/*` → Bernard API (port 8800)
- [ ] Map `/bernard/*` → Bernard UI (port 8810)
- [ ] Map LangGraph SDK routes to Bernard Agent (port 2024)

**Example:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => [
    // OpenAI-compatible API routes (custom proxy logic in API routes)
    { source: '/v1/:path*', destination: '/api/v1/:path*' },
    // Bernard API proxy
    { 
      source: '/api/:path*', 
      destination: 'http://127.0.0.1:8800/api/:path*'
    },
    // Bernard UI proxy
    { 
      source: '/bernard/:path*', 
      destination: 'http://127.0.0.1:8810/:path*'
    },
    // LangGraph SDK routes (proxy to Bernard Agent)
    { 
      source: '/threads/:path*', 
      destination: 'http://127.0.0.1:2024/threads/:path*'
    },
    { 
      source: '/runs/:path*', 
      destination: 'http://127.0.0.1:2024/runs/:path*'
    },
    { 
      source: '/assistants/:path*', 
      destination: 'http://127.0.0.1:2024/assistants/:path*'
    },
  ],
}
```

### 4.2 Implement API Route Proxies

**File:** `app/api/v1/[...path]/route.ts`

**Tasks:**
- [ ] Implement custom proxy logic for `/v1/*` routes
- [ ] Handle different upstream services:
  - `/v1/chat/completions` → Bernard Agent (2024)
  - `/v1/embeddings` → vLLM (8860)
  - `/v1/audio/transcriptions` → Whisper (8870)
  - `/v1/audio/speech` → Kokoro (8880)
  - `/v1/models` → aggregated response
- [ ] Forward headers: Authorization, Cookie, X-Api-Key
- [ ] Handle errors with proper status codes
- [ ] Support streaming responses (for chat completions)

**Example:**
```typescript
// app/api/v1/[...path]/route.ts
import { NextRequest } from 'next/server'

const UPSTREAMS = {
  'chat/completions': { url: 'http://127.0.0.1:2024/v1/chat/completions' },
  'embeddings': { url: 'http://127.0.0.1:8860/v1/embeddings' },
  'audio/transcriptions': { url: 'http://127.0.0.1:8870/inference' },
  'audio/speech': { url: 'http://127.0.0.1:8880/v1/audio/speech' },
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, params)
}

async function proxyRequest(req: NextRequest, paramsPromise: Promise<{ path: string[] }>) {
  const params = await paramsPromise
  const path = params.path.join('/')
  
  // Find appropriate upstream
  const upstream = findUpstream(path)
  if (!upstream) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  // Proxy request
  const targetUrl = `${upstream.url}${path ? '/' + path : ''}`
  const proxyReq = new Request(targetUrl, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.body,
    duplex: 'half',
  })

  try {
    const res = await fetch(proxyReq)
    
    // Stream response for chat completions
    if (path.startsWith('chat/completions')) {
      return new Response(res.body, {
        status: res.status,
        headers: res.headers,
      })
    }

    return NextResponse.json(await res.json(), { status: res.status })
  } catch (error) {
    return NextResponse.json(
      { error: 'Upstream Error', message: error.message },
      { status: 502 }
    )
  }
}
```

### 4.3 Migrate Auth Routes

**File:** `app/api/auth/route.ts`

**Tasks:**
- [ ] Copy OAuth logic from proxy-api/src/routes/auth.ts
- [ ] Implement `GET /auth/:provider/login`
- [ ] Implement `GET /auth/:provider/callback`
- [ ] Implement `GET /auth/me` (current user)
- [ ] Implement `POST /auth/logout`
- [ ] Use shared auth stores from lib/shared/auth

---

## Phase 5: Live Log Streaming

### 5.1 Log Streamer Implementation

**File:** `lib/services/LogStreamer.ts`

**Tasks:**
- [ ] Use `tail` package or Node.js `fs.watch` for log file monitoring
- [ ] Implement log file rotation handling
- [ ] Parse log lines (support JSON structured logs and plain text)
- [ ] Redact sensitive fields (tokens, passwords)
- [ ] Buffer and stream logs via SSE

**Key Methods:**
```typescript
class LogStreamer {
  private activeStreams: Map<string, WritableStream>

  async watchLog(service: string, writable: WritableStream): Promise<void>
  async unwatchLog(service: string): Promise<void>
  async tailLog(service: string, lines: number): Promise<string[]>
  async getCombinedLogStream(writable: WritableStream, filter?: string[]): Promise<void>
  
  private parseLogLine(line: string): ParsedLogEntry
  private redactSensitiveFields(entry: ParsedLogEntry): ParsedLogEntry
}
```

### 5.2 SSE Endpoint for Live Logs

**File:** `app/api/logs/stream/route.ts`

**Tasks:**
- [ ] GET endpoint accepting `service` query parameter
- [ ] Support `service=all` for combined logs
- [ ] Return SSE stream with log events
- [ ] Send last N lines on initial connection
- [ ] Continue streaming new lines
- [ ] Handle client disconnects
- [ ] Rate limit connections

**Example:**
```typescript
// app/api/logs/stream/route.ts
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const service = req.nextUrl.searchParams.get('service')
  
  if (!service || !isValidService(service)) {
    return new Response('Invalid service', { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const logStreamer = new LogStreamer()
      
      // Send last 100 lines first
      const recentLogs = await logStreamer.tailLog(service, 100)
      for (const log of recentLogs) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`))
      }

      // Start watching for new logs
      const writable = new WritableStream({
        write(chunk) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
        },
      })

      await logStreamer.watchLog(service, writable)

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        logStreamer.unwatchLog(service)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

### 5.3 Log Viewer Components

**File:** `components/dashboard/LogViewer.tsx`

**Tasks:**
- [ ] Use `useLogStream` hook for SSE connection
- [ ] Auto-scroll to bottom (configurable)
- [ ] Colorize log levels (INFO, WARN, ERROR)
- [ ] Parse and display structured JSON logs
- [ ] Support filtering by log level
- [ ] Support searching log entries
- [ ] Show service tags with colors
- [ ] Limit displayed entries (last 1000)

**File:** `components/dashboard/CombinedLogs.tsx`

**Tasks:**
- [ ] Display logs from all services combined
- [ ] Tab or filter UI to select services
- [ ] Use distinct colors per service
- [ ] Auto-scroll
- [ ] Collapsible service groups

---

## Phase 6: Authentication

### 6.1 Auth Middleware

**File:** `middleware.ts`

**Tasks:**
- [ ] Implement route protection middleware
- [ ] Skip auth for public routes:
  - `/health*`
  - `/auth/*`
  - `/bernard/*` (handled by Bernard UI)
  - `/status` (maybe require auth?)
- [ ] Check session cookie
- [ ] Check Authorization header (admin key)
- [ ] Redirect to `/login` for protected routes

**Example:**
```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from './lib/auth/session'

const PROTECTED_PATHS = ['/dashboard', '/api/services', '/api/logs']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip auth for public routes
  if (pathname.startsWith('/health') || 
      pathname.startsWith('/auth') ||
      pathname.startsWith('/bernard') ||
      pathname.startsWith('/api/health')) {
    return NextResponse.next()
  }

  // Check auth for protected routes
  if (PROTECTED_PATHS.some(path => pathname.startsWith(path))) {
    const session = await verifySession(req)
    
    if (!session) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // Add user context to headers
    const response = NextResponse.next()
    response.headers.set('x-user-id', session.userId)
    response.headers.set('x-user-role', session.role || 'user')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### 6.2 Auth Stores Migration

**Tasks:**
- [ ] Copy auth stores from `lib/shared/auth/`
- [ ] Ensure they work with Next.js server environment
- [ ] Use ioredis for Redis connection (reuse from lib/shared/infra/redis)
- [ ] Implement session verification function
- [ ] Implement admin token verification

### 6.3 Login Page

**File:** `app/(auth)/login/page.tsx`

**Tasks:**
- [ ] Create OAuth login buttons (GitHub, Google)
- [ ] Handle OAuth callback
- [ ] Redirect to `/status` after successful login
- [ ] Display error messages

---

## Phase 7: Auto-Start Integration

### 7.1 Development Server Startup

**File:** `package.json` (scripts)

**Tasks:**
- [ ] Add `npm run dev` script that:
  - Starts Next.js dev server
  - Starts core service in background
  - Auto-starts all dependent services
  - Waits for all services to be healthy
  - Displays status and logs

**Example:**
```json
{
  "scripts": {
    "dev": "tsx scripts/dev.ts",
    "dev:core": "next dev",
    "build": "next build",
    "start": "next start",
    "check": "npm run type-check && npm run lint",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext ts,tsx"
  }
}
```

### 7.2 Development Startup Script

**File:** `scripts/dev.ts`

**Tasks:**
- [ ] Implement startup orchestrator
- [ ] Start services in dependency order
- [ ] Wait for health checks
- [ ] Start Next.js dev server
- [ ] Log all output
- [ ] Handle SIGINT to clean up

**Example:**
```typescript
// scripts/dev.ts
import { ServiceManager } from '../core/lib/services/ServiceManager'
import { spawn } from 'child_process'

async function main() {
  const manager = new ServiceManager()
  
  console.log('Starting services...')
  await manager.startAll()
  
  console.log('Starting Next.js dev server...')
  const next = spawn('npm', ['run', 'dev:core'], {
    stdio: 'inherit',
    shell: true,
  })

  process.on('SIGINT', async () => {
    console.log('\nStopping services...')
    next.kill('SIGINT')
    await manager.stopAll()
    process.exit(0)
  })
}

main()
```

### 7.3 Root Package Integration

**File:** `package.json` (root)

**Tasks:**
- [ ] Update root scripts to use core service:
  ```json
  {
    "scripts": {
      "dev": "cd core && npm run dev",
      "build": "cd core && npm run build",
      "start": "cd core && npm run start"
    }
  }
  ```

---

## Phase 8: Testing & Validation

### 8.1 Unit Tests

**Tasks:**
- [ ] Test ServiceManager with mocked processes
- [ ] Test ProcessManager spawn/kill logic
- [ ] Test HealthChecker with mock HTTP responses
- [ ] Test LogStreamer with mock log files
- [ ] Test auth functions

### 8.2 Integration Tests

**Tasks:**
- [ ] Test full startup sequence
- [ ] Test service start/stop/restart commands
- [ ] Test log streaming endpoint
- [ ] Test proxy routes to upstream services
- [ ] Test OAuth flow

### 8.3 Manual Validation

**Tasks:**
- [ ] Verify all services start in correct order
- [ ] Verify status page displays correctly
- [ ] Verify service control buttons work
- [ ] Verify log streaming works (individual and combined)
- [ ] Verify proxy routes forward requests correctly
- [ ] Verify OAuth authentication works
- [ ] Verify admin key authentication works
- [ ] Verify live logs update in real-time
- [ ] Verify service health checks work
- [ ] Verify uptime tracking works

### 8.4 Performance Testing

**Tasks:**
- [ ] Test with all services running
- [ ] Test log streaming under load
- [ ] Test concurrent service control requests
- [ ] Measure memory usage

---

## Phase 9: Cleanup

### 9.1 Remove Legacy Components

**After core is validated and working:**

**Tasks:**
- [ ] Delete `proxy-api/` directory
- [ ] Delete `scripts/` directory (all bash scripts)
- [ ] Update root `package.json` to remove old scripts
- [ ] Update `.gitignore` if needed
- [ ] Update documentation (AGENTS.md, README.md)

### 9.2 Update Documentation

**Tasks:**
- [ ] Update AGENTS.md to reference core service
- [ ] Update root README.md with new startup commands
- [ ] Create core/README.md with core-specific documentation
- [ ] Document environment variables

---

## Security Considerations

### Critical Security Measures

1. **Input Validation**
   - Whitelist all service IDs in API routes
   - Validate all user inputs with Zod schemas
   - Sanitize file paths and commands

2. **Authentication & Authorization**
   - Require admin role for all service control operations
   - Implement rate limiting (5 commands/min per user)
   - Use HTTPS in production (cookie Secure flag)
   - Set appropriate CORS headers

3. **Process Security**
   - Never execute arbitrary user commands
   - Use spawn instead of exec for better control
   - Restrict spawned process permissions
   - Set timeouts on all spawned processes

4. **Log Security**
   - Redact sensitive fields from logs (API keys, tokens)
   - Validate log file paths (prevent directory traversal)
   - Rate limit SSE connections

5. **Redis Security**
   - Use Redis ACLs if available
   - Store secrets in environment variables, not Redis
   - Set appropriate TTLs for sessions

---

## Rollback Strategy

### If Issues Arise During Migration

1. **Keep Legacy Services Available**
   - Don't delete proxy-api or scripts until core is fully validated
   - Run both services in parallel during transition
   - Use different ports for core (e.g., 3457) during testing

2. **Feature Flags**
   - Add `USE_CORE_SERVICE` env var to switch between proxy-api and core
   - Allow gradual rollout of features

3. **Quick Rollback**
   - Revert root package.json to use old scripts
   - Stop core service, start proxy-api
   - All dependent services remain unchanged

---

## Implementation Order Summary

**Milestones:**

1. **Week 1**: Phase 1-2 (Project setup, Service Manager)
2. **Week 2**: Phase 3 (Status Dashboard)
3. **Week 3**: Phase 4-5 (Proxy routes, Log streaming)
4. **Week 4**: Phase 6-7 (Auth, Auto-start)
5. **Week 5**: Phase 8 (Testing & Validation)
6. **Week 6**: Phase 9 (Cleanup, if validated)

---

## Success Criteria

✅ `npm run dev` starts core service and all dependent services automatically
✅ `/status` page shows all services with correct status and uptime
✅ Service control buttons (start/stop/restart) work correctly
✅ Live logs stream in real-time (individual and combined views)
✅ Proxy routes forward requests to upstream services correctly
✅ Authentication works (OAuth and admin key)
✅ All services pass health checks
✅ No memory leaks in log streaming
✅ Cleanup scripts successfully removed proxy-api and @scripts/

---

