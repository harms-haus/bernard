# Migration Plan: Move `services/bernard-api` → `core/`

## Executive Summary

Move all functionality from `services/bernard-api` into the existing `core/` Next.js application (port 3456). The core service will become the unified entry point handling:

1. **Service management** - `/status` (UI) and `/api/status` (API)
2. **Bernard's API** - All endpoints directly (no proxying needed)
3. **Authentication** - `/auth/*` endpoints
4. **Bernard-agent code** - Agent code lives in `core/` but runs as separate process via `npm run agent:bernard`
5. **Proxying** - V1, Langchain, and `/bernard/` (to bernard-ui) proxied with Next.js

**Key decisions:**
- Fully remove Fastify - all proxying done with Next.js
- UI endpoints at `:3456/bernard/*` proxied to bernard-ui service (port 8810)
- Agent started with `npm run agent:bernard` from core

---

## Current Architecture

### To be consolidated:
- **`services/bernard-api/`** - Fastify API server (port 8800)
  - Auth endpoints (`/api/auth/*`)
  - Settings endpoints (`/api/settings/*`)
  - Threads, tokens, users, tasks, providers routes
  - Admin services management
  - Status/health checks
  - Shared libraries (auth, config, home-assistant, plex, weather, website)
  - Bernard agent tools

### Bernard-agent code locations:
- **`services/bernard-chat/apps/agents/`** - LangGraph agents (react-agent, memory-agent, research-agent, retrieval-agent)
- **`services/bernard-api/src/agents/bernard/`** - Bernard-specific agent tools

### Already in `core/`:
- **Next.js application** (port 3456)
- Service management infrastructure (`ServiceManager`, `ProcessManager`, `HealthChecker`)
- Auth infrastructure (already has auth endpoints at `/api/auth`)
- V1 API proxy endpoints
- Some initial API routes

---

## New Architecture

### `core/` will handle:

1. **Service Management**
   - `/status` - UI for service status and management
   - `/api/status` - API endpoint for service status
   - `/api/services` - Service control endpoints
   - `/api/admin/services` - Admin service management

2. **Bernard's API** - All endpoints directly (no proxy needed)
   - `/auth/*` - Authentication (renamed from `/api/auth/*`)
   - `/api/settings/*` - Settings management
   - `/api/threads/*` - Thread management
   - `/api/tokens/*` - API token management
   - `/api/users/*` - User management
   - `/api/tasks/*` - Background tasks
   - `/api/providers/*` - Provider management

3. **Authentication**
   - `/auth/*` - All auth endpoints (GitHub, Google OAuth, session management)

4. **Bernard-Agent Code**
   - Code lives in `core/agents/` (both bernard-specific and shared agents)
   - Started separately via `npm run agent:bernard`
   - Runs on port 2024
   - Proxied through core for V1/Langchain endpoints

5. **Proxying** - All via Next.js (no Fastify)
   - `/v1/*` → Proxy to bernard-agent (port 2024), vllm (8860), whisper (8870), kokoro (8880)
   - `/langchain/*` → Proxy to Langchain endpoints
   - `/bernard/*` → Proxy to bernard-ui (port 8810) - UI handles its own routing

### Remaining standalone services:
- **`bernard-ui`** (port 8810) - React frontend, accessed via `/bernard/*` proxy
- **`vllm`** (port 8860) - Embeddings
- **`kokoro`** (port 8880) - TTS
- **`whisper`** (port 8870) - STT
- **`bernard-agent`** - Started via `npm run agent:bernard`, code lives in `core/agents/`

---

## Directory Structure

```
core/
├── src/
│   ├── agents/              # Agent code (bernard-specific + shared LangGraph agents)
│   │   ├── bernard/         # Bernard-specific tools and configuration
│   │   │   ├── tools/
│   │   │   ├── prompts/
│   │   │   ├── configuration.ts
│   │   │   ├── state.ts
│   │   │   └── updates.ts
│   │   └── shared/          # LangGraph agents from bernard-chat/apps/agents
│   │       ├── react-agent/
│   │       ├── memory-agent/
│   │       ├── research-agent/
│   │       └── retrieval-agent/
│   ├── lib/
│   │   ├── services/        # Service management (already exists)
│   │   ├── auth/            # Auth infrastructure (merge with bernard-api auth)
│   │   ├── config/          # Configuration (merge with bernard-api config)
│   │   ├── home-assistant/  # Home Assistant integration
│   │   ├── plex/           # Plex integration
│   │   ├── weather/         # Weather service
│   │   ├── website/         # Website scraping
│   │   ├── infra/           # Infrastructure (queues, redis, timeouts)
│   │   ├── logging/         # Logging infrastructure
│   │   └── utils/           # Utility functions
│   └── app/
│       ├── (dashboard)/     # Service management UI
│       │   └── status/      # /status page
│       ├── api/
│       │   ├── auth/        # /auth/* endpoints
│       │   ├── settings/    # /api/settings/* endpoints
│       │   ├── threads/     # /api/threads/* endpoints
│       │   ├── tokens/      # /api/tokens/* endpoints
│       │   ├── users/       # /api/users/* endpoints
│       │   ├── tasks/       # /api/tasks/* endpoints
│       │   ├── providers/   # /api/providers/* endpoints
│       │   ├── admin/       # Admin endpoints
│       │   ├── services/    # /api/services/* endpoints
│       │   ├── status/      # /api/status endpoint
│       │   ├── health/      # Health endpoints
│       │   ├── v1/          # /v1/* proxy (existing)
│       │   └── langchain/  # /langchain/* proxy
│       └── bernard/         # Proxy to bernard-ui (port 8810)
│           └── [...path]/route.ts
├── langgraph.json          # LangGraph agent configuration
├── scripts/
│   └── start-agent.ts      # Agent startup script
└── package.json            # Merged dependencies
```

---

## Migration Steps

### Phase 1: Core Structure Preparation

**1.1 Create core/ directory structure**
```bash
# Create directories
mkdir -p core/src/agents/bernard
mkdir -p core/src/agents/shared
mkdir -p core/src/lib/home-assistant
mkdir -p core/src/lib/plex
mkdir -p core/src/lib/weather
mkdir -p core/src/lib/website
mkdir -p core/src/lib/infra
mkdir -p core/src/lib/logging
mkdir -p core/src/lib/utils
mkdir -p core/scripts
```

**1.2 Create agent startup script**
- Create `core/scripts/start-agent.ts` that:
  - Imports LangGraph configuration from `core/langgraph.json`
  - Starts the LangGraph server on port 2024
  - Uses `@langgraph/langgraph-api` to serve agents

**1.3 Update core/package.json scripts**
```json
{
  "scripts": {
    "agent:bernard": "tsx scripts/start-agent.ts",
    "dev": "next dev --port 3456 --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start --port 3456",
    "type-check": "tsc --noEmit"
  }
}
```

---

### Phase 2: Move and Migrate Libraries

**2.1 Merge auth libraries**
- Compare `core/src/lib/auth/` with `services/bernard-api/src/lib/auth.ts`
- Merge functionality, ensuring compatibility with existing `lib/shared/auth`
- Update to use Next.js request/response instead of Fastify
- Remove Fastify-specific code (cookies, hooks, etc.)

**2.2 Move service-specific libraries**
```bash
cp -r services/bernard-api/src/lib/home-assistant/* core/src/lib/home-assistant/
cp -r services/bernard-api/src/lib/plex/* core/src/lib/plex/
cp -r services/bernard-api/src/lib/weather/* core/src/lib/weather/
cp -r services/bernard-api/src/lib/website/* core/src/lib/website/
cp -r services/bernard-api/src/lib/infra/* core/src/lib/infra/
cp -r services/bernard-api/src/lib/logging/* core/src/lib/logging/
```

**2.3 Move utility files**
```bash
cp services/bernard-api/src/lib/string.ts core/src/lib/utils/
cp services/bernard-api/src/lib/tokenCounter.ts core/src/lib/utils/
cp services/bernard-api/src/lib/taskKeeper.ts core/src/lib/infra/
```

**2.4 Update import paths**
- Update all imports in moved files to use `@/lib/*` paths
- Remove Fastify imports
- Replace FastifyRequest/Reply with NextRequest/NextResponse

---

### Phase 3: Move and Migrate Routes (Fastify → Next.js)

**3.1 Auth routes**
- Update `core/src/app/api/auth/route.ts` with missing endpoints from bernard-api
- Change path from `/api/auth/*` → `/auth/*`
- Convert from Fastify to Next.js API routes:

| Old (Fastify) | New (Next.js) |
|---------------|---------------|
| `fastify.get("/:provider/login")` | `GET /auth/login?provider=github` |
| `fastify.get("/:provider/callback")` | `GET /auth/callback?provider=github` |
| `fastify.get("/me")` | `GET /auth/me` |
| `fastify.get("/admin")` | `GET /auth/admin` |
| `fastify.post("/logout")` | `POST /auth/logout` |
| `fastify.post("/validate")` | `POST /auth/validate` |

**Key changes:**
- Fastify `request.cookies` → Next.js `request.cookies.get()`
- Fastify `reply.cookie()` → Next.js `response.cookies.set()`
- Fastify `reply.status()` → Next.js `NextResponse.json({ status })`
- Fastify hooks → Next.js middleware (if needed)

**3.2 Settings routes**
- Update `core/src/app/api/settings/route.ts` with all endpoints from bernard-api
- Migrate all sub-routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/settings` | GET | Get all settings |
| `/api/settings/models` | GET | Get models settings |
| `/api/settings/models` | PUT | Update models settings |
| `/api/settings/services` | GET | Get services settings |
| `/api/settings/services` | PUT | Update services settings |
| `/api/settings/backups` | GET | Get backup settings |
| `/api/settings/backups` | PUT | Update backup settings |
| `/api/settings/oauth` | GET | Get OAuth settings |
| `/api/settings/oauth` | PUT | Update OAuth settings |
| `/api/settings/services/test/home-assistant` | POST | Test HA connection |
| `/api/settings/services/test/plex` | POST | Test Plex connection |
| `/api/settings/services/test/tts` | POST | Test TTS connection |
| `/api/settings/services/test/stt` | POST | Test STT connection |

**3.3 Create new API routes (convert from Fastify to Next.js)**

**Threads:**
```bash
# Create: core/src/app/api/threads/route.ts
# Convert services/bernard-api/src/routes/threads.ts
# Map endpoints:
# GET /api/threads → GET /api/threads
# POST /api/threads → POST /api/threads
# GET /api/threads/:id → GET /api/threads/[id]/route.ts
# DELETE /api/threads/:id → DELETE /api/threads/[id]/route.ts
```

**Tokens:**
```bash
# Create: core/src/app/api/tokens/route.ts
# Convert services/bernard-api/src/routes/tokens.ts
# Map endpoints:
# GET /api/tokens → GET /api/tokens
# POST /api/tokens → POST /api/tokens
# DELETE /api/tokens/:id → DELETE /api/tokens/[id]/route.ts
```

**Users:**
```bash
# Create: core/src/app/api/users/route.ts
# Convert services/bernard-api/src/routes/users.ts
# Map endpoints:
# GET /api/users → GET /api/users
# GET /api/users/:id → GET /api/users/[id]/route.ts
# PUT /api/users/:id → PUT /api/users/[id]/route.ts
```

**Tasks:**
```bash
# Create: core/src/app/api/tasks/route.ts
# Convert services/bernard-api/src/routes/tasks.ts
# Map endpoints:
# GET /api/tasks → GET /api/tasks
# POST /api/tasks → POST /api/tasks
# GET /api/tasks/:id → GET /api/tasks/[id]/route.ts
# DELETE /api/tasks/:id → DELETE /api/tasks/[id]/route.ts
```

**Providers:**
```bash
# Create: core/src/app/api/providers/route.ts
# Convert services/bernard-api/src/routes/providers.ts
# Map endpoints:
# GET /api/providers → GET /api/providers
# GET /api/providers/:id → GET /api/providers/[id]/route.ts
# DELETE /api/providers/:id → DELETE /api/providers/[id]/route.ts
```

**Admin Services:**
```bash
# Create: core/src/app/api/admin/services/route.ts
# Convert services/bernard-api/src/routes/adminServices.ts
# Map endpoints:
# POST /admin/services/restart → POST /api/admin/services/restart
# POST /admin/services/stop → POST /api/admin/services/stop
# POST /admin/services/start → POST /api/admin/services/start
```

**3.4 Status endpoint**
```bash
# Create/Update: core/src/app/api/status/route.ts
# Keep existing functionality from bernard-api
# Maintain: /api/status
```

**3.5 Route path mapping summary**

| Old (bernard-api) | New (core) |
|-------------------|------------|
| GET /health | GET /health/ok (already exists) |
| GET /api/status | GET /api/status (keep) |
| GET /api/settings/* | GET /api/settings/* (keep) |
| PUT /api/settings/* | PUT /api/settings/* (keep) |
| GET /api/auth/* | GET /auth/* (renamed) |
| POST /api/auth/* | POST /auth/* (renamed) |
| GET /api/threads/* | GET /api/threads/* (keep) |
| POST /api/threads/* | POST /api/threads/* (keep) |
| GET /api/tokens/* | GET /api/tokens/* (keep) |
| POST /api/tokens/* | POST /api/tokens/* (keep) |
| GET /api/users/* | GET /api/users/* (keep) |
| POST /api/users/* | POST /api/users/* (keep) |
| GET /api/tasks/* | GET /api/tasks/* (keep) |
| POST /api/tasks/* | POST /api/tasks/* (keep) |
| GET /api/providers/* | GET /api/providers/* (keep) |
| POST /api/providers/* | POST /api/providers/* (keep) |
| POST /admin/services/* | POST /api/admin/services/* (moved) |

---

### Phase 4: Move Agent Code

**4.1 Move bernard-specific agent tools**
```bash
cp -r services/bernard-api/src/agents/bernard/* core/src/agents/bernard/
```

**4.2 Move shared LangGraph agents**
```bash
cp -r services/bernard-chat/apps/agents/* core/src/agents/shared/
```

**4.3 Move langgraph configuration**
```bash
cp services/bernard-chat/langgraph.json core/langgraph.json
```

**4.4 Update langgraph.json paths**
```json
{
  "node_version": "20",
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/agents/shared/react-agent/graph.ts:graph",
    "memory_agent": "./src/agents/shared/memory-agent/graph.ts:graph",
    "research_agent": "./src/agents/shared/research-agent/retrieval-graph/graph.ts:graph",
    "research_index_graph": "./src/agents/shared/research-agent/index-graph/graph.ts:graph",
    "retrieval_agent": "./src/agents/shared/retrieval-agent/graph.ts:graph"
  },
  "env": ".env"
}
```

**4.5 Update agent imports**
- Update all imports in agent files to use new paths
- Ensure agent tools can import from `@/lib/*`
- Update `core/src/agents/bernard/tools/index.ts` exports

**4.6 Create agent entry point**
- Create `core/src/agents/index.ts` that exports all agents
- Ensure all agents are discoverable by LangGraph CLI

---

### Phase 5: Dependency Migration

**5.1 Update core/package.json**
- Merge dependencies from `services/bernard-api/package.json`
- **Remove all Fastify packages**:
  - `@fastify/cookie`
  - `@fastify/cors`
  - `@fastify/http-proxy`
  - `@fastify/multipart`
  - `fastify`

- **Add/keep dependencies**:
  ```json
  {
    "dependencies": {
      "@langchain/core": "^1.1.8",
      "@langchain/langgraph": "^1.0.7",
      "@langchain/langgraph-api": "^0.0.14",
      "@langchain/langgraph-checkpoint-redis": "^1.0.1",
      "@langchain/langgraph-sdk": "~1.3.1",
      "@langchain/ollama": "^1.1.0",
      "@langchain/openai": "^1.2.0",
      "@langchain/redis": "^1.0.1",
      "@mozilla/readability": "^0.5.0",
      "bullmq": "^5.66.0",
      "home-assistant-js-websocket": "^9.6.0",
      "ioredis": "^5.8.2",
      "js-tiktoken": "^1.0.15",
      "jsdom": "^27.3.0",
      "jsonrepair": "^3.13.1",
      "next": "^15.1.0",
      "plex-api": "^5.3.2",
      "pino": "^9.6.0",
      "wikipedia": "^2.4.2",
      "zod": "^4.3.4"
    }
  }
  ```

- **Add dev dependencies for agent script**:
  ```json
  {
    "devDependencies": {
      "@types/jsdom": "^27.0.0",
      "@types/node": "^20.10.0",
      "tsx": "^4.19.2"
    }
  }
  ```

**5.2 Remove unused Fastify-specific code**
- Remove any middleware that relies on Fastify hooks
- Replace with Next.js middleware if needed (middleware.ts in src/app)

**5.3 Update TypeScript configuration**
- Ensure `core/tsconfig.json` has proper path aliases
- Add paths for moved libraries
- Ensure `strict` mode is maintained

---

### Phase 6: Proxy Configuration (Next.js)

**6.1 Update V1 proxy routes**
- Keep existing `core/src/app/api/v1/[...path]/route.ts`
- Convert from any Fastify proxy to pure Next.js fetch
- Ensure it continues to proxy to:
  - Bernard-agent (port 2024): `/v1/chat/completions`, `/v1/models`
  - VLLM (port 8860): `/v1/embeddings`
  - Whisper (port 8870): `/v1/audio/transcriptions`
  - Kokoro (port 8880): `/v1/audio/speech`

**6.2 Update service URLs in config**
- Update `core/src/lib/services/config.ts`:
  ```typescript
  export const SERVICES = {
    bernardAgent: {
      name: 'BERNARD_AGENT',
      url: process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024',
      healthPath: '/health',
    },
    bernardUi: {
      name: 'BERNARD_UI',
      url: process.env.BERNARD_UI_URL || 'http://127.0.0.1:8810',
      healthPath: '/health',
    },
    vllm: {
      name: 'VLLM',
      url: process.env.VLLM_URL || 'http://127.0.0.1:8860',
      healthPath: '/health',
    },
    whisper: {
      name: 'WHISPER',
      url: process.env.WHISPER_URL || 'http://127.0.0.1:8870',
      healthPath: '/health',
    },
    kokoro: {
      name: 'KOKORO',
      url: process.env.KOKORO_URL || 'http://127.0.0.1:8880',
      healthPath: '/health',
    },
  } as const;
  ```

**6.3 Create Langchain proxy route**
- Create `core/src/app/api/langchain/[...path]/route.ts`
- Configure to proxy Langchain endpoints to appropriate services (bernard-agent, vllm, etc.)
- Use Next.js fetch for proxying

**6.4 Create UI proxy route**
- Create `core/src/app/bernard/[...path]/route.ts`
- Proxy all `/bernard/*` requests to bernard-ui service (port 8810)
- Let bernard-ui handle its own routing

Example:
```typescript
import { NextRequest } from 'next/server'

const BERNARD_UI_URL = process.env.BERNARD_UI_URL || 'http://127.0.0.1:8810'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.pathname.replace('/bernard', '')
  const url = new URL(path, BERNARD_UI_URL)

  const response = await fetch(url.toString(), {
    headers: request.headers,
  })

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  })
}

// Repeat for POST, PUT, DELETE, etc.
```

---

### Phase 7: Service Management

**7.1 Update status endpoint**
- Merge `/api/status` functionality from bernard-api
- Include status of all services including core itself
- Keep at `/api/status` (no change)

**7.2 Admin service routes**
- Move admin services management to `core/src/app/api/admin/services/route.ts`
- Convert from Fastify to Next.js API routes
- Use ProcessManager from existing core/lib/services

**7.3 Update service manager**
- Update `core/src/lib/services/ServiceManager.ts` to manage all services
- Include bernard-agent, bernard-ui, vllm, whisper, kokoro
- Use ProcessManager for process control

**7.4 Update service scripts**
- Update bernard-agent startup to use core location
- Create/update service management scripts to use core endpoints

---

### Phase 8: Convert Fastify → Next.js

**8.1 Remove Fastify-specific patterns**

**Replace Fastify hooks with Next.js middleware:**
```typescript
// Fastify:
fastify.addHook("preHandler", async (request, reply) => { ... })

// Next.js middleware (src/middleware.ts):
export function middleware(request: NextRequest) {
  // Auth checks, etc.
  return NextResponse.next()
}
```

**Replace Fastify error handler with Next.js error handling:**
```typescript
// Fastify:
fastify.setErrorHandler((error, request, reply) => { ... })

// Next.js (in each route or app/error.ts):
export async function POST(request: NextRequest) {
  try {
    // ...
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

**Replace Fastify logging with custom logging:**
```typescript
// Fastify:
fastify.addHook("onResponse", (request, reply) => { ... })

// Next.js (in each route or use middleware):
const logger = require('@/lib/logging/logger')
logger.info(`${method} ${url} - ${statusCode}`)
```

**8.2 Update authentication middleware**
- Convert Fastify auth hooks to Next.js middleware or helper functions
- Update to work with NextRequest/NextResponse
- Ensure session cookies work with Next.js

**8.3 Update request/response handling**
- Replace `request.body` with `await request.json()`
- Replace `request.query` with `request.nextUrl.searchParams`
- Replace `request.params` with URL path parameters
- Replace `reply.send()` with `NextResponse.json()`
- Replace `reply.status()` with `NextResponse.json({ status })`

---

### Phase 9: Testing & Validation

**9.1 Unit tests**
- Move tests from `services/bernard-api/` to `core/`
- Update import paths
- Run all tests: `npm run test`

**9.2 Integration tests**
- Test all API endpoints work correctly
- Test authentication flow:
  - GitHub OAuth: GET /auth/login?provider=github
  - Google OAuth: GET /auth/login?provider=google
  - Session management: GET /auth/me
  - Logout: POST /auth/logout
- Test settings management
- Test service management

**9.3 Proxy testing**
- Test V1 proxy endpoints:
  - GET /api/v1/models
  - POST /api/v1/chat/completions (streaming)
  - POST /api/v1/embeddings
  - POST /api/v1/audio/transcriptions
  - POST /api/v1/audio/speech
- Test Langchain proxy endpoints
- Test UI proxy: GET /bernard/*
- Test streaming responses

**9.4 Manual testing checklist**

**Core functionality:**
- [ ] Health check: GET /health/ok
- [ ] Status API: GET /api/status
- [ ] Status UI: GET /status

**Authentication:**
- [ ] GitHub login: GET /auth/login?provider=github
- [ ] GitHub callback: GET /auth/callback?provider=github
- [ ] Google login: GET /auth/login?provider=google
- [ ] Google callback: GET /auth/callback?provider=google
- [ ] Get current user: GET /auth/me
- [ ] Admin check: GET /auth/admin
- [ ] Logout: POST /auth/logout
- [ ] Token validation: POST /auth/validate

**Settings:**
- [ ] Get all settings: GET /api/settings
- [ ] Get models: GET /api/settings/models
- [ ] Update models: PUT /api/settings/models
- [ ] Get services: GET /api/settings/services
- [ ] Update services: PUT /api/settings/services
- [ ] Get backups: GET /api/settings/backups
- [ ] Update backups: PUT /api/settings/backups
- [ ] Get OAuth: GET /api/settings/oauth
- [ ] Update OAuth: PUT /api/settings/oauth
- [ ] Test HA: POST /api/settings/services/test/home-assistant
- [ ] Test Plex: POST /api/settings/services/test/plex
- [ ] Test TTS: POST /api/settings/services/test/tts
- [ ] Test STT: POST /api/settings/services/test/stt

**APIs:**
- [ ] List threads: GET /api/threads
- [ ] Create thread: POST /api/threads
- [ ] Get thread: GET /api/threads/[id]
- [ ] Delete thread: DELETE /api/threads/[id]
- [ ] List tokens: GET /api/tokens
- [ ] Create token: POST /api/tokens
- [ ] Delete token: DELETE /api/tokens/[id]
- [ ] List users: GET /api/users
- [ ] Get user: GET /api/users/[id]
- [ ] Update user: PUT /api/users/[id]
- [ ] List tasks: GET /api/tasks
- [ ] Create task: POST /api/tasks
- [ ] Get task: GET /api/tasks/[id]
- [ ] Delete task: DELETE /api/tasks/[id]
- [ ] List providers: GET /api/providers
- [ ] Get provider: GET /api/providers/[id]
- [ ] Delete provider: DELETE /api/providers/[id]

**Service management:**
- [ ] List services: GET /api/services
- [ ] Get service status: GET /api/services/[service]
- [ ] Restart service: POST /api/admin/services/restart
- [ ] Stop service: POST /api/admin/services/stop
- [ ] Start service: POST /api/admin/services/start

**Proxy:**
- [ ] UI proxy: GET /bernard/*
- [ ] V1 models: GET /api/v1/models
- [ ] V1 chat: POST /api/v1/chat/completions
- [ ] V1 embeddings: POST /api/v1/embeddings
- [ ] V1 transcriptions: POST /api/v1/audio/transcriptions
- [ ] V1 speech: POST /api/v1/audio/speech
- [ ] Langchain endpoints: /api/langchain/*

**Agent:**
- [ ] Agent starts with npm run agent:bernard
- [ ] Agent responds on port 2024
- [ ] Agent health: GET http://127.0.0.1:2024/health
- [ ] Agent tools work correctly
- [ ] All agents discoverable: GET http://127.0.0.1:2024/ok

---

## Routing Summary

**After migration:**

| Route Pattern | Destination | Implementation |
|---------------|-------------|-----------------|
| `/status` | Core status UI | Next.js page at core/src/app/(dashboard)/status/page.tsx |
| `/api/status` | Core status API | Next.js API route at core/src/app/api/status/route.ts |
| `/auth/*` | Core auth handlers | Next.js API routes at core/src/app/api/auth/ |
| `/api/settings/*` | Core settings | Next.js API routes at core/src/app/api/settings/ |
| `/api/threads/*` | Core threads | Next.js API routes at core/src/app/api/threads/ |
| `/api/tokens/*` | Core tokens | Next.js API routes at core/src/app/api/tokens/ |
| `/api/users/*` | Core users | Next.js API routes at core/src/app/api/users/ |
| `/api/tasks/*` | Core tasks | Next.js API routes at core/src/app/api/tasks/ |
| `/api/providers/*` | Core providers | Next.js API routes at core/src/app/api/providers/ |
| `/api/admin/services/*` | Core admin | Next.js API routes at core/src/app/api/admin/services/route.ts |
| `/api/services/*` | Core service management | Next.js API routes at core/src/app/api/services/route.ts |
| `/health*` | Core health | Next.js API routes at core/src/app/api/health/ |
| `/bernard/*` | Proxy to bernard-ui | Next.js API route at core/src/app/bernard/[...path]/route.ts |
| `/api/v1/*` | Proxy to services | Next.js API route at core/src/app/api/v1/[...path]/route.ts |
| `/v1/*` | Proxy to services | Next.js API route at core/src/app/api/v1/[...path]/route.ts |
| `/api/langchain/*` | Proxy to services | Next.js API route at core/src/app/api/langchain/[...path]/route.ts |

**Service endpoints (proxied):**

| V1 Route | Service | Port |
|-----------|----------|------|
| `/v1/chat/completions` | bernard-agent | 2024 |
| `/v1/models` | bernard-agent | 2024 |
| `/v1/embeddings` | vllm | 8860 |
| `/v1/audio/transcriptions` | whisper | 8870 |
| `/v1/audio/speech` | kokoro | 8880 |

---

## Dependencies to Merge

### From bernard-api/package.json (remove Fastify, add others):

**Remove:**
```json
{
  "@fastify/cookie": "^11.0.1",
  "@fastify/cors": "^10.0.1",
  "@fastify/http-proxy": "^11.4.1",
  "@fastify/multipart": "^9.0.1",
  "fastify": "^5.2.0"
}
```

**Add:**
```json
{
  "@langchain/langgraph-api": "^0.0.14",
  "@mozilla/readability": "^0.5.0",
  "bullmq": "^5.66.0",
  "home-assistant-js-websocket": "^9.6.0",
  "js-tiktoken": "^1.0.15",
  "jsdom": "^27.3.0",
  "jsonrepair": "^3.13.1",
  "plex-api": "^5.3.2",
  "wikipedia": "^2.4.2"
}
```

---

## Risk Mitigation

### High-risk areas:

1. **Authentication flow**
   - **Risk**: OAuth and session management breaking
   - **Mitigation**: Carefully test all auth flows, ensure cookies work with Next.js
   - **Rollback**: Keep old auth code until fully tested

2. **Proxy functionality**
   - **Risk**: V1 and Langchain endpoints not working
   - **Mitigation**: Test all proxy endpoints, especially streaming
   - **Rollback**: Can revert to old proxy implementation

3. **Agent imports**
   - **Risk**: Agent tools cannot import from shared libs
   - **Mitigation**: Test all agent tools, update imports systematically
   - **Rollback**: Keep old agent location until tested

4. **Settings persistence**
   - **Risk**: Settings no longer persist to Redis
   - **Mitigation**: Test all settings endpoints, verify Redis connection
   - **Rollback**: Can revert to old settings code

5. **Fastify removal**
   - **Risk**: Missing Fastify-specific functionality
   - **Mitigation**: Systematic review of all Fastify hooks/middleware
   - **Rollback**: Keep Fastify packages until confirmed unneeded

### Rollback plan:

1. Keep `services/bernard-api` intact until fully tested
2. Can revert service startup script to use old bernard-api
3. Document exact changes for easy rollback
4. Use git branches for each phase

---

## Estimated Effort

- **Phase 1**: 1-2 hours (structure and scripts)
- **Phase 2**: 2-3 hours (library migration and imports)
- **Phase 3**: 6-8 hours (route migration - Fastify → Next.js)
- **Phase 4**: 2-3 hours (agent code migration)
- **Phase 5**: 1-2 hours (dependencies and config)
- **Phase 6**: 2-3 hours (proxy configuration)
- **Phase 7**: 2-3 hours (service management)
- **Phase 8**: 2-3 hours (Fastify removal, Next.js conversion)
- **Phase 9**: 6-8 hours (testing and validation)
- **Phase 10**: 1-2 hours (cleanup)
- **Phase 11**: 2-3 hours (deployment)

**Total: 27-40 hours**

---

## Post-Migration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Core (port 3456)                   │
│                        Next.js Application                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  /status    │  │  /auth/*    │  │/api/*      │      │
│  │  (UI)       │  │  (Auth)     │  │(APIs)      │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐    │
│  │             Next.js API Routes                      │    │
│  │  /auth/*, /api/*, /health/*, /status/*           │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  /bernard/*  │  │  /v1/*       │  │ /langchain/* │   │
│  │  (Proxy UI)  │  │ (Proxy API)  │  │ (Proxy API)  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
└─────────┼───────────────────┼──────────────────┼────────────┘
          │                   │                  │
          ▼                   ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │bernard-ui│      │bernard   │      │vllm      │
    │ :8810    │      │agent     │      │ :8860    │
    │(React)   │      │:2024     │      │(embed)   │
    └──────────┘      └──────────┘      └──────────┘
                                            │
                                            ▼
                                      ┌──────────┐
                                      │whisper   │
                                      │ :8870    │
                                      │(STT)     │
                                      └──────────┘
                                            │
                                            ▼
                                      ┌──────────┐
                                      │kokoro    │
                                      │ :8880    │
                                      │(TTS)     │
                                      └──────────┘

    ┌─────────────────────────────────────────────┐
    │  Core Library Code                        │
    ├─────────────────────────────────────────────┤
    │  agents/bernard/      ← Agent tools     │
    │  agents/shared/       ← LangGraph agents│
    │  lib/auth/           ← Auth            │
    │  lib/config/         ← Config          │
    │  lib/services/       ← Service mgmt    │
    │  lib/home-assistant/ ← HA integration  │
    │  lib/plex/           ← Plex integration│
    │  lib/weather/         ← Weather         │
    │  lib/website/        ← Web scraping   │
    │  lib/infra/          ← Infra          │
    │  lib/logging/        ← Logging        │
    └─────────────────────────────────────────────┘
```

---

## Success Criteria

Migration is complete when:

1. ✅ All API endpoints from bernard-api work in core
2. ✅ Auth flows (GitHub, Google, sessions) work correctly
3. ✅ Settings endpoints work and persist to Redis
4. ✅ Service management works (start, stop, restart)
5. ✅ Agent code in core/agents/ works correctly
6. ✅ Agent starts with `npm run agent:bernard`
7. ✅ V1 proxy endpoints work (including streaming)
8. ✅ Langchain proxy endpoints work
9. ✅ UI proxy `/bernard/*` works correctly
10. ✅ All tests pass
11. ✅ No Fastify dependencies remain
12. ✅ services/bernard-api is removed
13. ✅ Documentation is updated
14. ✅ No regressions in existing functionality

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `feat/merge-api-to-core`
3. Execute phases 1-3 (structure, libraries, routes)
4. Test core functionality
5. Execute phases 4-8 (agents, dependencies, proxy, service mgmt, Fastify removal)
6. Comprehensive testing (Phase 9)
7. Cleanup and documentation (Phase 10)
8. Deployment (Phase 11)
9. Merge to main
