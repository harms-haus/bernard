# API Route Migration Summary

This document maps all routes from the original Fastify-based `bernard-api` service (port 8800) to the new Next.js-based `core/` application (port 3456).

## Route Mapping

### Authentication Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/auth/me` | `/app/api/auth/me/route.ts` | GET | Get current authenticated user |
| `/api/auth/admin` | `/app/api/auth/admin/route.ts` | GET | Check if user is admin |
| `/api/auth/login` | `/app/api/auth/login/route.ts` | POST | User login with OAuth |
| `/api/auth/admin-login` | `/app/api/auth/admin-login/route.ts` | POST | Admin login with OAuth |
| `/api/auth/callback` | `/app/api/auth/callback/route.ts` | GET | OAuth callback handler |
| `/api/auth/validate` | `/app/api/auth/validate/route.ts` | GET | Validate current session |
| `/api/auth/logout` | `/app/api/auth/logout/route.ts` | POST | User logout |

### Settings Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/settings/models` | `/app/api/settings/route.ts` | GET, PUT | Get/update model settings |
| `/api/settings/services` | `/app/api/settings/route.ts` | GET, PUT | Get/update service settings |
| `/api/settings/backups` | `/app/api/settings/route.ts` | GET, PUT | Get/update backup settings |
| `/api/settings/oauth` | `/app/api/settings/route.ts` | GET, PUT | Get/update OAuth settings |
| `/api/settings` | `/app/api/settings/route.ts` | GET | Get all settings |
| `/api/settings/services/test/plex` | `/app/api/settings/services/test/plex/route.ts` | POST | Test Plex connection |
| `/api/settings/services/test/tts` | `/app/api/settings/services/test/tts/route.ts` | POST | Test TTS connection |
| `/api/settings/services/test/stt` | `/app/api/settings/services/test/stt/route.ts` | POST | Test STT connection |
| `/api/settings/services/test/home-assistant` | `/app/api/settings/services/test/home-assistant/route.ts` | POST | Test Home Assistant connection |

### Thread Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/threads` | `/app/api/threads/route.ts` | GET | List all threads |
| `/api/threads/:id` | `/app/api/threads/[id]/route.ts` | GET, PATCH, DELETE | Get/update/delete specific thread |
| `/api/threads/:id/auto-rename` | `/app/api/threads/[id]/auto-rename/route.ts` | POST | Generate thread title with LLM |

### Token Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/tokens` | `/app/api/tokens/route.ts` | GET, POST | List/create API tokens |
| `/api/tokens/:id` | `/app/api/tokens/[id]/route.ts` | GET, PATCH, DELETE | Get/update/delete specific token |

### User Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/users` | `/app/api/users/route.ts` | GET, POST | List/create users |
| `/api/users/:id` | `/app/api/users/[id]/route.ts` | GET, PATCH, DELETE | Get/update/delete specific user |
| `/api/users/:id/reset` | `/app/api/users/[id]/reset/route.ts` | POST | Reset user data |

### Task Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/tasks` | `/app/api/tasks/route.ts` | GET, POST, DELETE | List tasks, cancel task, delete task |
| `/api/tasks/:id` | `/app/api/tasks/[id]/route.ts` | GET | Get task details |

### Provider Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/providers` | `/app/api/providers/route.ts` | GET, POST | List/create providers |
| `/api/providers/:id` | `/app/api/providers/[id]/route.ts` | GET, PUT, DELETE | Get/update/delete specific provider |
| `/api/providers/:id/test` | `/app/api/providers/[id]/test/route.ts` | POST | Test provider connection |
| `/api/providers/:id/models` | `/app/api/providers/[id]/models/route.ts` | GET | Fetch provider models |

### Admin Services Routes

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/admin/services` | `/app/api/admin/services/route.ts` | GET, POST | List services, restart service |

### Status Route

| Fastify Route | Next.js Route | Methods | Description |
|---------------|----------------|----------|-------------|
| `/api/status` | `/app/api/status/route.ts` | GET | Get system status and health |

## Implementation Notes

### Fastify to Next.js Conversion Pattern

The following pattern was used for all route conversions:

1. **Route Registration**:
   - Fastify: `fastify.get('/path', handler)` → Next.js: `export async function GET(request) {}`
   - Fastify: `fastify.post('/path', handler)` → Next.js: `export async function POST(request) {}`
   - Fastify: `fastify.patch('/path', handler)` → Next.js: `export async function PATCH(request) {}`
   - Fastify: `fastify.delete('/path', handler)` → Next.js: `export async function DELETE(request) {}`
   - Fastify: `fastify.put('/path', handler)` → Next.js: `export async function PUT(request) {}`

2. **Request Handling**:
   - Fastify: `request.body` → Next.js: `await request.json()`
   - Fastify: `request.query` → Next.js: `request.nextUrl.searchParams`
   - Fastify: `request.params.id` → Next.js: `{ params }: { params: { id: string } }`

3. **Response Handling**:
   - Fastify: `reply.send(data)` → Next.js: `NextResponse.json(data)`
   - Fastify: `reply.status(404).send(data)` → Next.js: `NextResponse.json(data, { status: 404 })`
   - Fastify: `reply.status(204).send()` → Next.js: `NextResponse.json({}, { status: 204 })`

### Auth Helper Functions

Created reusable auth helper functions in `/core/src/lib/auth/helpers.ts`:

- `requireAdmin(request)`: Require admin access, returns NextResponse on failure
- `requireAuth(request)`: Require authentication, returns NextResponse on failure

These helpers simplify route handlers by returning early with proper HTTP status codes when auth fails.

### Import Path Strategy

All imports use `@/lib/*` path aliases:
- `@/lib/auth/*` - Authentication and authorization
- `@/lib/config/*` - Configuration management
- `@/lib/logging/*` - Logging utilities
- `@/lib/infra/*` - Infrastructure services (Redis, queues, etc.)

### Error Handling

- Consistent error logging with `logger.error()`
- HTTP status codes: 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Internal Server Error)
- Error messages follow pattern: `{ error: "Description" }`

## Status

✅ **Phase 3 Complete**: All routes migrated from Fastify to Next.js

**Next Phase**: Phase 4 - Move Agent Code
- Move `services/bernard-api/src/agents/bernard/*` → `core/src/agents/bernard/`
- Move `services/bernard-chat/apps/agents/*` → `core/src/agents/shared/`
- Copy `services/bernard-chat/langgraph.json` → `core/langgraph.json`
- Update all agent imports to use new paths
