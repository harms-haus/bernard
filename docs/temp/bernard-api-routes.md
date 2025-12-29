# Bernard API Routes Migration Guide

## Overview

Commit `0932cc292c48f09b3e2c3f6a5b1738fe6fb8856f` deleted 38 API route files from `services/bernard/app/api/*` that should have been migrated to `services/bernard-api/` instead. This document catalogs all deleted routes, their functionality, Redis key patterns, and provides code snippets for recreation.

## Architecture Context

- **bernard** (`/v1/*`) - Main AI agent application (Next.js)
- **bernard-ui** (`/bernard/*`) - Frontend React/Vite interface
- **bernard-api** (`/api/*`) - Management API server (Fastify) ← Routes should be here

## Deleted Routes Summary

### Total Files Deleted: 38
- 6 Admin routes
- 5 Conversation routes
- 3 Task routes
- 3 User routes
- 2 Token routes
- 3 Provider routes
- 4 Settings routes
- 4 Auth routes
- 2 V1 routes
- 2 Other routes
- 4 Helper libraries

---

## Route Categories

### 1. Admin Routes (`/api/admin/*`)

#### `admin/automations/route.ts`
**Purpose:** List all automations registered in the system

**Redis Keys:** Uses automation registry (in-memory or Redis-backed)
```typescript
import type { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { getAutomationRegistry } from "@/lib/automation/registry";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/automations" });
  if ("error" in auth) return auth.error;

  try {
    const registry = await getAutomationRegistry();
    const automations = Array.from(registry.entries()).map(([id, entry]) => ({
      id,
      name: entry.automation.name,
      description: entry.automation.description,
      hooks: entry.automation.hooks,
      enabled: entry.settings.enabled,
      lastRunTime: entry.settings.lastRunTime,
      lastRunDuration: entry.settings.lastRunDuration,
      runCount: entry.settings.runCount
    }));

    return Response.json({ automations });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch automations" }), { status: 500 });
  }
}
```

**Fastify Equivalent:**
```typescript
fastify.get("/api/admin/automations", async (request, reply) => {
  // Auth check via getAuthenticatedUser(request)
  const registry = await getAutomationRegistry();
  const automations = Array.from(registry.entries()).map(([id, entry]) => ({
    id,
    name: entry.automation.name,
    description: entry.automation.description,
    hooks: entry.automation.hooks,
    enabled: entry.settings.enabled,
    lastRunTime: entry.settings.lastRunTime,
    lastRunDuration: entry.settings.lastRunDuration,
    runCount: entry.settings.runCount
  }));
  return { automations };
});
```

---

#### `admin/automations/[id]/route.ts`
**Purpose:** Manage individual automation (update settings, trigger, etc.)

**Redis Keys:** Potentially stored in automation registry

---

#### `admin/clear-entire-index/route.ts`
**Purpose:** Clear the embedding index for memory/recall functionality

**Redis Keys:** Related to embedding index storage (see `lib/memory/embeddingIndex.ts`)
- Pattern: `*:embedding:*` or similar memory indices

---

#### `admin/history/route.ts`
**Purpose:** Admin view of all conversation history

**Redis Keys:**
- `conversation:*` - Conversation metadata and state
- `user:*` - User records
- `session:*` - Session records
- `token:*` - Access token records

**Code Example:**
```typescript
import type { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { SessionStore, TokenStore, UserStore } from "@/lib/auth";
import { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import { getRedis } from "@/lib/infra/redis";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/history" });
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const includeOpen = searchParams.get("includeOpen") !== "false";
  const includeClosed = searchParams.get("includeClosed") !== "false";
  const limit = limitParam ? Number(limitParam) : undefined;

  const redis = getRedis();
  const keeper = new RecordKeeper(redis);
  const tokens = new TokenStore(redis);
  const sessions = new SessionStore(redis);
  const users = new UserStore(redis);

  try {
    await keeper.closeIfIdle();
    const conversations = await keeper.listConversations({
      includeOpen,
      includeClosed,
      ...(limit !== undefined ? { limit } : {})
    });

    // Resolve tokens to user names
    const tokenCache = new Map<string, { id: string; name: string }>();
    const resolveToken = async (token: string) => {
      if (tokenCache.has(token)) return tokenCache.get(token);
      const resolvedToken = await tokens.resolve(token);
      if (resolvedToken) {
        const mapped = { id: resolvedToken.id, name: resolvedToken.name };
        tokenCache.set(token, mapped);
        return mapped;
      }
      const session = await sessions.get(token);
      if (session) {
        const user = await users.get(session.userId);
        if (user && user.status === "active") {
          const mapped = { id: user.id, name: user.displayName };
          tokenCache.set(token, mapped);
          return mapped;
        }
      }
      return null;
    };

    const items = [];
    for (const conversation of conversations) {
      const tokenNames = [];
      const tokenIds = [];
      const tokenSet = conversation.tokenSet ?? [];
      for (const token of tokenSet) {
        const resolved = await resolveToken(token);
        if (resolved) {
          tokenIds.push(resolved.id);
          if (!tokenNames.includes(resolved.name)) {
            tokenNames.push(resolved.name);
          }
        }
      }
      items.push({
        id: conversation.id,
        status: conversation.status,
        startedAt: conversation.startedAt,
        lastTouchedAt: conversation.lastTouchedAt,
        messageCount: conversation.userAssistantCount ?? conversation.messageCount ?? 0,
        source: tokenNames[0] ?? "Unknown token",
        tokenNames,
        tokenIds,
        ...(conversation.errorCount !== undefined && { errorCount: conversation.errorCount })
      });
    }

    return Response.json({ items, total: items.length });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unable to list history" }), { status: 500 });
  }
}
```

---

#### `admin/history/[id]/route.ts`
**Purpose:** Admin view of specific conversation detail

**Redis Keys:**
- `conversation:{id}` - Specific conversation data
- `conversation:{id}:messages` - Messages within conversation

---

#### `admin/services/restart/route.ts`
**Purpose:** Restart system services via shell scripts

**Code Example:**
```typescript
import type { NextRequest } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAdmin } from "@/lib/auth";

const execAsync = promisify(exec);

const SERVICE_SCRIPTS: Record<string, string> = {
  redis: "scripts/services/redis.sh",
  vllm: "scripts/services/vllm-embedding.sh",
  kokoro: "scripts/services/kokoro.sh",
  whisper: "scripts/services/whisper.sh",
  bernard: "scripts/services/bernard.sh",
  "bernard-ui": "scripts/services/bernard-ui.sh",
  server: "scripts/services/server.sh"
};

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await req.json() as { service?: unknown };
    const service = body.service;

    if (!service || typeof service !== "string") {
      return new Response(JSON.stringify({ error: "Service name is required" }), { status: 400 });
    }

    const scriptPath = SERVICE_SCRIPTS[service];
    if (!scriptPath) {
      return new Response(JSON.stringify({
        error: "Invalid service name",
        availableServices: Object.keys(SERVICE_SCRIPTS)
      }), { status: 400 });
    }

    const fullPath = `${process.cwd()}/../${scriptPath}`;
    const { stdout, stderr } = await execAsync(`${fullPath} restart`);

    return Response.json({
      success: true,
      service,
      message: `Restart initiated for ${service}`,
      output: stdout || stderr
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "Failed to restart service",
      details: error instanceof Error ? error.message : "Unknown error"
    }), { status: 500 });
  }
}
```

---

### 2. Conversation Routes (`/api/conversations/*`)

#### `conversations/[id]/route.ts`
**Purpose:** Get conversation details

**Redis Keys:**
- `conversation:{id}` - Conversation metadata
- `conversation:{id}:messages` - Messages (possibly sorted set or list)

---

#### `conversations/[id]/cancel-indexing/route.ts`
**Purpose:** Cancel ongoing embedding indexing for a conversation

**Redis Keys:**
- `conversation:{id}:indexing` - Indexing state
- Potentially `*:embedding:*` keys

---

#### `conversations/[id]/indexing-status/route.ts`
**Purpose:** Check indexing status for a conversation

**Redis Keys:**
- `conversation:{id}:indexing` - Indexing state and progress

---

#### `conversations/[id]/retry-indexing/route.ts`
**Purpose:** Retry failed embedding indexing for a conversation

**Redis Keys:**
- `conversation:{id}:indexing` - Indexing state

---

#### `conversations/[id]/trigger-automation/[automationId]/route.ts`
**Purpose:** Manually trigger an automation for a conversation

**Redis Keys:** Automation registry entries

---

### 3. Task Routes (`/api/tasks/*`)

#### `tasks/route.ts`
**Purpose:** List user's tasks, create new tasks, manage task actions

**Redis Keys:**
- `task:{id}` - Individual task data
- `user:{userId}:tasks` - User's task list (sorted set by timestamp)
- `task:queue` - Pending task queue

**Code Example:**
```typescript
import type { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { TaskRecordKeeper } from "@/agent/recordKeeper/task.keeper";
import { getRedis } from "@/lib/infra/redis";
import { logger } from "@/lib/logging";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const userId = user.user.id;
  const recordKeeper = new TaskRecordKeeper(getRedis());

  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get("includeArchived") === "true";
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

  try {
    const result = await recordKeeper.listTasks({
      userId,
      includeArchived,
      limit,
      offset
    });

    return Response.json({
      tasks: result.tasks,
      total: result.total,
      hasMore: result.hasMore
    });
  } catch (error) {
    logger.error({ event: "tasks.list.error", error }, "Error listing tasks");
    return new Response(JSON.stringify({ error: "Failed to list tasks" }), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const userId = user.user.id;
  const recordKeeper = new TaskRecordKeeper(getRedis());

  let body: { action?: string; taskId?: string };
  try {
    body = await req.json() as { action?: string; taskId?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { action, taskId } = body;
  if (!taskId || !action) {
    return new Response(JSON.stringify({ error: "Missing taskId or action" }), { status: 400 });
  }

  try {
    switch (action) {
      case "cancel": {
        const task = await recordKeeper.getTask(taskId);
        if (!task) {
          return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
        }
        if (task.userId !== userId) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
        }
        const success = await recordKeeper.cancelTask(taskId);
        if (!success) {
          return new Response(JSON.stringify({ error: "Operation failed" }), { status: 400 });
        }
        return Response.json({ success: true });
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
    }
  } catch (error) {
    logger.error({ event: "tasks.action.error", action, taskId, error }, "Error performing task action");
    return new Response(JSON.stringify({ error: "Failed to perform action" }), { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const userId = user.user.id;
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return new Response(JSON.stringify({ error: "Missing taskId" }), { status: 400 });
  }

  const recordKeeper = new TaskRecordKeeper(getRedis());

  try {
    const task = await recordKeeper.getTask(taskId);
    if (!task) {
      return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
    }
    if (task.userId !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    const success = await recordKeeper.deleteTask(taskId);
    if (!success) {
      return new Response(JSON.stringify({ error: "Task cannot be deleted" }), { status: 400 });
    }
    return Response.json({ success: true });
  } catch (error) {
    logger.error({ event: "tasks.delete.error", taskId, error }, "Error deleting task");
    return new Response(JSON.stringify({ error: "Failed to delete task" }), { status: 500 });
  }
}
```

---

#### `tasks/[id]/route.ts`
**Purpose:** Get specific task details

**Redis Keys:**
- `task:{id}` - Task data

---

#### `tasks/create/route.ts`
**Purpose:** Create a new background task

**Redis Keys:**
- `task:{id}` - New task data
- `user:{userId}:tasks` - User's task list
- `task:queue` - Pending task queue

---

### 4. User Routes (`/api/users/*`)

#### `users/route.ts`
**Purpose:** List all users, create new users (admin only)

**Redis Keys:**
- `user:{id}` - User records
- Pattern: `user:*` for user enumeration

**Code Example:**
```typescript
import type { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { UserStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/users" });
  if ("error" in auth) return auth.error;

  const users = await new UserStore(getRedis()).list();
  return Response.json({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/users" });
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as { id?: string; displayName?: string; isAdmin?: boolean };
    if (!body.id || !body.displayName || typeof body.isAdmin !== "boolean") {
      return new Response(
        JSON.stringify({ error: "id, displayName, and isAdmin are required" }),
        { status: 400 }
      );
    }

    const store = new UserStore(getRedis());
    const created = await store.create({
      id: body.id,
      displayName: body.displayName,
      isAdmin: body.isAdmin
    });
    return Response.json({ user: created }, { status: 201 });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unable to create user" }),
      { status: 400 }
    );
  }
}
```

---

#### `users/[id]/route.ts`
**Purpose:** Get/update/delete specific user

**Redis Keys:**
- `user:{id}` - User data

---

#### `users/[id]/reset/route.ts`
**Purpose:** Reset user data or settings

**Redis Keys:**
- `user:{id}` - User data

---

### 5. Token Routes (`/api/tokens/*`)

#### `tokens/route.ts`
**Purpose:** List all access tokens, create new tokens (admin only)

**Redis Keys:**
- `token:{id}` - Token records
- `user:{userId}:tokens` - User's tokens

**Code Example:**
```typescript
import type { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { TokenStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/tokens" });
  if ("error" in auth) return auth.error;

  const store = new TokenStore(getRedis());
  const tokens = await store.list();
  return Response.json({ tokens });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/tokens" });
  if ("error" in auth) return auth.error;

  const store = new TokenStore(getRedis());
  try {
    const body = await req.json() as { name?: string };
    if (!body.name) {
      return new Response(JSON.stringify({ error: "`name` is required" }), { status: 400 });
    }
    const record = await store.create(body.name);
    return Response.json({
      token: {
        id: record.id,
        name: record.name,
        status: record.status,
        createdAt: record.createdAt,
        token: record.token
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}
```

---

#### `tokens/[id]/route.ts`
**Purpose:** Get/update/delete specific token

**Redis Keys:**
- `token:{id}` - Token data

---

### 6. Provider Routes (`/api/providers/*`)

#### `providers/route.ts`
**Purpose:** List providers, add new provider (admin only)

**Redis Keys:**
- `settings:providers` - Providers configuration (hash or list)

**Code Example:**
```typescript
import type { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";

interface ProviderPayload {
  name: string;
  baseUrl: string;
  apiKey: string;
  type?: "openai" | "ollama" | undefined;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/providers" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const providers = await store.getProviders();
  return Response.json(providers);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/providers" });
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as Partial<ProviderPayload>;
    const store = settingsStore();

    const { name, baseUrl, apiKey, type } = body;
    if (!name || !baseUrl || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, baseUrl, apiKey" }),
        { status: 400 }
      );
    }

    const payload: ProviderPayload = { name, baseUrl, apiKey, type };

    // Test the provider connection
    const testResult = await store.testProviderConnection({
      ...payload,
      id: "",
      createdAt: "",
      updatedAt: "",
      type: payload.type || "openai"
    });

    const provider = await store.addProvider({
      name: payload.name,
      type: payload.type || "openai",
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      lastTestedAt: new Date().toISOString(),
      testStatus: testResult.status,
      testError: testResult.error
    });

    return Response.json({ provider }, { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}
```

---

#### `providers/[id]/route.ts`
**Purpose:** Get/update/delete specific provider

**Redis Keys:**
- `settings:providers:{id}` - Individual provider config

---

#### `providers/[id]/test/route.ts`
**Purpose:** Test provider connection

**Redis Keys:** None (tests connection to external service)

---

### 7. Settings Routes (`/api/settings/*`)

#### `settings/route.ts`
**Purpose:** Get global settings

**Redis Keys:**
- `settings:*` - Various settings entries

---

#### `settings/backups/route.ts`
**Purpose:** Manage data backups

**Redis Keys:**
- `settings:backups` - Backup configuration
- May involve file system operations

---

#### `settings/oauth/route.ts`
**Purpose:** Manage OAuth configuration

**Redis Keys:**
- `settings:oauth:*` - OAuth provider configs

---

#### `settings/services/route.ts`
**Purpose:** Manage service configurations

**Redis Keys:**
- `settings:services:*` - Service configurations

---

### 8. Auth Routes (`/api/auth/*`)

#### `auth/github/login/route.ts`
**Purpose:** Initiate GitHub OAuth flow

**Flow:** Redirects to GitHub OAuth consent screen

---

#### `auth/github/callback/route.ts`
**Purpose:** Handle GitHub OAuth callback

**Flow:** Exchanges code for access token, creates session

---

#### `auth/google/login/route.ts`
**Purpose:** Initiate Google OAuth flow

**Flow:** Redirects to Google OAuth consent screen

---

#### `auth/google/callback/route.ts`
**Purpose:** Handle Google OAuth callback

**Flow:** Exchanges code for access token, creates session

---

### 9. History Route (`/api/history`)

#### `history/route.ts`
**Purpose:** Search conversation history (user-facing)

**Redis Keys:**
- `conversation:*` - Conversation data
- Indexes for search by keywords, time range, etc.

**Code Example:**
```typescript
import type { NextRequest } from "next/server";
import { validateAccessToken } from "@/lib/auth";
import { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import { getRedis } from "@/lib/infra/redis";

export async function GET(req: NextRequest) {
  const auth = await validateAccessToken(req);
  if ("error" in auth) return auth.error;
  const token = auth.access.token;

  const keeper = new RecordKeeper(getRedis());

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId") ?? undefined;
  const place = searchParams.get("place") ?? undefined;
  const keywordsRaw = searchParams.get("keywords") ?? undefined;
  const since = searchParams.get("since") ? Number(searchParams.get("since")) : undefined;
  const until = searchParams.get("until") ? Number(searchParams.get("until")) : undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const includeMessages = searchParams.get("includeMessages") === "true";
  const messageLimit = searchParams.get("messageLimit") ? Number(searchParams.get("messageLimit")) : undefined;

  const keywords = keywordsRaw
    ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
    : undefined;

  const timeRange: { since?: number; until?: number } = {};
  if (since !== undefined) timeRange.since = since;
  if (until !== undefined) timeRange.until = until;

  const recallArgs = { token, includeMessages };
  if (place) recallArgs.place = place;
  if (keywords) recallArgs.keywords = keywords;
  if (typeof limit === "number") recallArgs.limit = limit;
  if (typeof messageLimit === "number") recallArgs.messageLimit = messageLimit;
  if (conversationId) recallArgs.conversationId = conversationId;
  if (Object.keys(timeRange).length) recallArgs.timeRange = timeRange;

  const results = await keeper.recallConversation(recallArgs);
  return Response.json({ results });
}

export async function POST(req: NextRequest) {
  const auth = await validateAccessToken(req);
  if ("error" in auth) return auth.error;
  const token = auth.access.token;

  let body: { conversationId?: string; token?: string } = {};
  try {
    body = await req.json() as typeof body;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), { status: 400 });
  }

  if (!body.conversationId) {
    return new Response(JSON.stringify({ error: "`conversationId` is required" }), { status: 400 });
  }

  const keeper = new RecordKeeper(getRedis());
  const convo = await keeper.reopenConversation(body.conversationId, body.token ?? token);
  if (!convo) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
  }

  return Response.json({ conversation: convo });
}
```

---

### 10. Health Route (`/api/health`)

#### `health/route.ts`
**Purpose:** Basic health check endpoint

---

### 11. Record Keeper Status Route (`/api/recordkeeper/status`)

#### `recordkeeper/status/route.ts`
**Purpose:** Get RecordKeeper status and statistics

**Redis Keys:** Uses RecordKeeper internal state
- Tracks active conversations, queue size, etc.

---

### 12. V1 Routes (`/api/v1/*`)

#### `v1/chat/completions/route.ts`
**Purpose:** OpenAI-compatible chat completions API (288 lines - significant)

**Note:** This route may need to stay in bernard as it handles `/v1/*` routes which is bernard's domain

---

#### `v1/completions/route.ts`
**Purpose:** OpenAI-compatible completions API

**Note:** This route may need to stay in bernard as it handles `/v1/*` routes

---

### 13. Helper Libraries (Deleted)

#### `_lib/admin.ts`
**Purpose:** Admin authentication and request utilities

**Code:**
```typescript
import type { NextRequest } from "next/server";
import { requireAdmin, type AuthenticatedUser } from "@/lib/auth";
import type { LogContext } from "@/lib/logging";
import { buildRequestLogger } from "./logging";

export type AdminRequestContext = {
  admin: AuthenticatedUser;
  reqLog: ReturnType<typeof buildRequestLogger>;
};

export async function requireAdminRequest(
  req: NextRequest,
  context: LogContext = {}
): Promise<{ error: Response; reqLog: ReturnType<typeof buildRequestLogger> } | AdminRequestContext> {
  const reqLog = buildRequestLogger(req, context);
  const admin = await requireAdmin(req);
  if (!admin) {
    const error = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    reqLog.failure(401, "admin_required");
    return { error, reqLog };
  }
  reqLog.log.info({ event: "admin.auth.granted", adminId: admin.user.id });
  return { admin, reqLog };
}
```

---

#### `_lib/cors.ts` and `_lib/cors-utils.ts`
**Purpose:** CORS configuration utilities

---

#### `_lib/logging.ts`
**Purpose:** Request logging utilities

---

#### `settings/_common.ts`
**Purpose:** Common settings utilities (used by providers route)

---

## Current bernard-api Routes (Only 3 Exist)

As of the commit, bernard-api only has:
- `/api/settings` - Settings routes (partial)
- `/api/auth` - Only `/validate` endpoint exists
- `/api/providers` - Only basic list/create exists

---

## Migration Recommendations

### Priority 1: Routes that break UI functionality
1. `api/tasks/*` - Tasks page in UI
2. `api/history` - History search
3. `api/providers/*` - Provider management
4. `api/users/*` - User management
5. `api/tokens/*` - Token management

### Priority 2: Admin functionality
1. `api/admin/history/*` - Admin history view
2. `api/admin/services/restart` - Service management
3. `api/admin/automations/*` - Automation management

### Priority 3: Conversation management
1. `api/conversations/*` - Conversation operations
2. `api/recordkeeper/status` - Status monitoring

### Priority 4: Auth routes
1. `api/auth/*` - OAuth flows (GitHub, Google)

---

## Common Redis Key Patterns

Based on the deleted code, common Redis key patterns include:

| Entity | Pattern | Description |
|--------|---------|-------------|
| User | `user:{id}` | User records |
| Session | `session:{id}` | Session data |
| Token | `token:{id}` | Access tokens |
| Conversation | `conversation:{id}` | Conversation metadata |
| Conversation Messages | `conversation:{id}:messages` | Messages in conversation |
| Task | `task:{id}` | Task records |
| User Tasks | `user:{userId}:tasks` | User's tasks index |
| Settings | `settings:*` | Various settings |
| Providers | `settings:providers` | Provider configurations |
| Embeddings | `*:embedding:*` | Memory/embedding indices |
| Automation | Registry-based | Automation registry |

---

## Implementation Notes for Fastify Migration

1. **Auth Middleware**: Create reusable auth middleware similar to `requireAdminRequest`
2. **Request Logging**: Adapt `buildRequestLogger` for Fastify
3. **RecordKeeper**: The `RecordKeeper` and `TaskRecordKeeper` classes are in bernard - may need to be shared or duplicated
4. **Stores**: `UserStore`, `TokenStore`, `SessionStore` are in bernard's `lib/auth`
5. **Settings Store**: The `settingsStore()` pattern from `_common.ts` needs migration
6. **Automation Registry**: `getAutomationRegistry()` from `lib/automation/registry`

All these utility classes and functions are currently in the bernard codebase and will need to be either:
- Shared via a common library
- Duplicated in bernard-api
- Exposed via internal API calls to bernard
