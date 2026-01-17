# Plan: Add "Guest" Role to User System

**Date:** January 17, 2026
**Status:** Approved (pending implementation)

## Overview

Add a new "guest" role to the existing user system with specific access restrictions and tool behavior modifications for guest users.

## Current State Analysis

### User Role System
- **Current model**: Uses `isAdmin: boolean` flag in `UserRecord` (in `core/src/lib/auth/types.ts`)
- **Better-Auth**: Uses `role` field with string values ("admin" by default for first user)
- **Two parallel systems**:
  1. Better-Auth's native role in Redis (`role` field)
  2. Custom `UserStore` with `isAdmin` boolean

### Tool System
- Tools registered in `core/src/agents/bernard/tools/validation.ts` via `getToolDefinitions()`
- Factory pattern returns `{ok: true, tool}` or `{ok: false, name, reason}` (disabled tools)
- Agent receives `validTools` and `disabledTools` arrays

### Route Protection
- Middleware in `core/src/middleware.ts` checks session cookie
- Server helpers in `core/src/lib/auth/server-helpers.ts` provide `requireAuth()` and `requireAdmin()`

---

## Requirements

1. New users created through login/signup automatically get "guest" role
2. Admin can change role from "guest" to "user" or "admin" on `/bernard/admin/users` page
3. Guest users cannot view:
   - `/bernard/user/*` (all user pages)
   - `/status`
4. Create a utility to DENY access to guests (like `requireAuth` and `requireAdmin`)
5. Tool behavior changes for guests:
   - `play_media_tv`: **HIDDEN** from available tools (not in disabled list)
   - All Overseerr tools: **HIDDEN** from available tools
   - All Home Assistant tools: **MOCK successful execution** instead of actual HA calls

---

## Implementation Plan

### 1. Update User Role Types

**Files to modify:**
- `core/src/lib/auth/types.ts`
- `core/src/types/auth.ts`

**Changes:**
```typescript
// Add role type
export type UserRole = "guest" | "user" | "admin";

// Update UserRecord to use role instead of isAdmin
export type UserRecord = {
  id: string;
  displayName: string;
  role: UserRole;  // replaces isAdmin
  status: "active" | "disabled" | "deleted";
  // ... rest
};
```

### 2. Update UserStore to Handle Roles

**File:** `core/src/lib/auth/userStore.ts`

**Changes:**
- Change `isAdmin: boolean` to `role: UserRole`
- New users via OAuth get `role: "guest"` (not "user")
- First user still gets `role: "admin"`
- Update `sanitize()`, `upsertOAuthUser()`, `create()`, `update()` methods
- Add helper methods:
  - `isGuest(user: UserRecord): boolean`
  - `getRole(user: UserRecord): UserRole`

**Migration for existing users:**
- `isAdmin: true` → `role: "admin"`
- `isAdmin: false` → `role: "user"`

### 3. Update Better-Auth Configuration

**File:** `core/src/lib/auth/auth.ts`

**Changes:**
- Update `databaseHooks.user.create.before` to set `role: "guest"` for new users
- First user still gets `role: "admin"`

```typescript
databaseHooks: {
  user: {
    create: {
      before: async (user) => {
        const userIds = await redis.smembers("ba:s:user:ids");
        const hasAdmin = userIds.some(async (id) => {
          const role = await redis.hget(`ba:m:user:${id}`, "role");
          return role === "admin";
        });

        return {
          data: {
            ...user,
            role: hasAdmin ? "guest" : "admin"
          }
        };
      }
    }
  }
}
```

### 4. Create Guest Denial Utility

**File:** `core/src/lib/auth/server-helpers.ts` (extend existing)

**Add:**
```typescript
export async function requireAuth() {
  const session = await getSession();
  return session;
}

export async function requireAdmin() {
  const session = await getSession();
  return session?.user.role === "admin" ? session : null;
}

export async function denyGuest() {
  const session = await getSession();
  if (!session) {
    return null; // Not authenticated
  }
  if (session.user.role === "guest") {
    return null; // Deny access to guests
  }
  return session;
}

export async function requireNonGuest() {
  const session = await denyGuest();
  return session;
}
```

### 5. Update Middleware for Guest Route Restrictions

**File:** `core/src/middleware.ts`

**Changes:**
- Add guest-denied routes
- Fetch session to check role

```typescript
// Routes that require authentication but deny guests
const guestDeniedRoutes = [
  "/bernard/user",
  "/status",
];

// Routes that require admin role
const adminRoutes = [
  "/bernard/admin",
  "/bernard/admin/models",
  "/bernard/admin/services",
  "/bernard/admin/users",
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check route requirements
  const requiresAuth = protectedRoutes.some((route) => pathname.startsWith(route));
  const requiresAdmin = adminRoutes.some((route) => pathname.startsWith(route));
  const deniesGuests = guestDeniedRoutes.some((route) => pathname.startsWith(route));

  if (!requiresAuth && !requiresAdmin && !deniesGuests) {
    return NextResponse.next();
  }

  // Get session
  const sessionToken = getSessionCookie(request);
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Get session details to check role
  const session = await auth.api.getSession({
    headers: { cookie: request.headers.get("cookie") || "" },
  });

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Check role-based restrictions
  if (deniesGuests && session.user.role === "guest") {
    return NextResponse.redirect(new URL("/bernard/chat", request.url));
  }

  if (requiresAdmin && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/bernard/chat", request.url));
  }

  return NextResponse.next();
}
```

### 6. Update Admin Users Page for Role Management

**File:** `core/src/app/(dashboard)/bernard/admin/users/page.tsx`

**Changes:**
- Replace `isAdmin` checkbox with role dropdown (guest/user/admin)
- Update `UserForm` interface
- Update role display in table with color-coded badges
- Update API calls to use `role` instead of `isAdmin`

**UI Changes:**
```typescript
// In UserForm interface
interface UserForm {
  id: string;
  displayName: string;
  role: "guest" | "user" | "admin";
}

// In table, display role as badge
<Badge variant={user.role === "admin" ? "default" : user.role === "guest" ? "warning" : "secondary"}>
  {user.role === "admin" ? "Administrator" : user.role === "guest" ? "Guest" : "User"}
</Badge>
```

### 7. Update Tool Validation for Guest Context

**Files:**
- `core/src/agents/bernard/tools/types.ts`
- `core/src/agents/bernard/tools/validation.ts`

**Add ToolContext type:**
```typescript
import type { UserRole } from "@/lib/auth/types";

export type ToolContext = {
  userRole?: UserRole;
};
```

### 8. Hide Tools from Guests (play_media_tv, overseer tools)

**File:** `core/src/agents/bernard/tools/validation.ts`

**Tools to HIDE from guests:**
- `play_media_tv`
- `find_media_status` (overseerr)
- `request_media` (overseerr)
- `list_media_requests` (overseerr)
- `cancel_media_request` (overseerr)
- `report_media_issue` (overseerr)

**Changes:**
```typescript
const GUEST_HIDDEN_TOOLS = [
  'play_media_tv',
  'find_media_status',
  'request_media',
  'list_media_requests',
  'cancel_media_request',
  'report_media_issue',
];

export function getToolDefinitions(context?: ToolContext): ToolDefinition[] {
  const allTools: ToolDefinition[] = [
    { name: 'web_search', factory: webSearchToolFactory },
    { name: 'website_content', factory: getWebsiteContentToolFactory },
    { name: 'wikipedia_search', factory: wikipediaSearchToolFactory },
    { name: 'wikipedia_entry', factory: wikipediaEntryToolFactory },
    { name: 'get_weather', factory: getWeatherDataToolFactory },
    { name: 'home_assistant_list_entities', factory: listHAEntitiesToolFactory },
    { name: 'home_assistant_execute_services', factory: executeHomeAssistantServicesToolFactory },
    { name: 'toggle_home_assistant_light', factory: toggleLightToolFactory },
    { name: 'get_home_assistant_historical_state', factory: getHistoricalStateToolFactory },
    { name: 'play_media_tv', factory: playMediaTvToolFactory },
    { name: 'search_media', factory: searchMediaToolFactory },
  ];

  // Filter out hidden tools for guests
  if (context?.userRole === 'guest') {
    return allTools.filter(t => !GUEST_HIDDEN_TOOLS.includes(t.name));
  }

  return allTools;
}
```

### 9. Mock Home Assistant Tools for Guests

**Files:**
- `core/src/agents/bernard/tools/home-assistant-execute-services.tool.ts`
- `core/src/agents/bernard/tools/home-assistant-toggle-light.tool.ts`
- `core/src/agents/bernard/tools/home-assistant-list-entities.tool.ts`
- `core/src/agents/bernard/tools/home-assistant-historical-state.tool.ts`

**Approach:** Each tool factory checks context and returns mock version for guests.

**Example for execute-services:**
```typescript
export const executeHomeAssistantServicesToolFactory: ToolFactory = async (context?: ToolContext) => {
  // Mock for guests
  if (context?.userRole === 'guest') {
    const mockTool = tool(
      async ({ list }) => {
        if (!Array.isArray(list) || list.length === 0) {
          return "No service calls provided.";
        }
        const results = list.map(call =>
          `[Demo] ${call.domain}.${call.service} on ${call.service_data.entity_id}`
        );
        return "Home Assistant service calls simulated (demo mode):\n" + results.join('\n');
      },
      {
        name: "execute_home_assistant_services",
        description: "Execute services on Home Assistant entities (demo mode for guests)",
        schema: z.object({
          list: z.array(z.object({
            domain: z.string(),
            service: z.string(),
            service_data: z.object({
              entity_id: z.union([z.string(), z.array(z.string())])
            })
          }))
        })
      }
    );
    return { ok: true, tool: mockTool };
  }

  // Normal behavior for non-guests
  const isValid = await verifyHomeAssistantConfigured();
  if (!isValid.ok) {
    return { ok: false, name: "execute_home_assistant_services", reason: isValid.reason ?? "" };
  }
  const settings = await getSettings();
  const haConfig = settings.services?.homeAssistant;
  const tool = createExecuteHomeAssistantServicesTool(haConfig as HARestConfig | undefined);
  return { ok: true, tool: tool, name: tool.name };
};
```

**Same pattern for:**
- `toggleLightToolFactory` - returns mock success message
- `listHAEntitiesToolFactory` - returns empty list with demo message
- `getHistoricalStateToolFactory` - returns demo state data

### 10. Pass User Role to Agent

**File:** `core/src/agents/bernard/bernard.agent.ts`

**Current Issue:** Agent is created as singleton, tools validated once.

**Solution:** Pass user role through conversation metadata, tools check at runtime.

```typescript
export async function createBernardAgent(
  overrides?: Partial<AgentDependencies>,
  toolContext?: ToolContext
) {
  // ... existing code
  const { validTools, disabledTools } = await deps.validateAndGetTools(toolContext);
  // ... rest
}
```

**Thread creation should include user role:**
- When creating thread via API, store user role in thread metadata
- Agent accesses via `config.configurable?.metadata`

### 11. API Routes - Role Management

**File:** `core/src/app/api/users/[id]/route.ts`

**Changes:**
- Update `PATCH` to accept `role` instead of `isAdmin`
- Validate role transitions (guest → user/admin only, admin only can make others admin)

### 12. Frontend API Client

**File:** `core/src/services/adminApi.ts`

**Changes:**
- Update `updateUser()` to accept `{ role: "guest" | "user" | "admin" }`

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `core/src/lib/auth/types.ts` | Modify | Add `UserRole` type, update `UserRecord` |
| `core/src/types/auth.ts` | Modify | Add `UserRole` type, update `User` interface |
| `core/src/lib/auth/userStore.ts` | Modify | Replace `isAdmin` with `role`, add helpers |
| `core/src/lib/auth/auth.ts` | Modify | New users get "guest" role by default |
| `core/src/lib/auth/server-helpers.ts` | Modify | Add `denyGuest()`, `requireNonGuest()` |
| `core/src/middleware.ts` | Modify | Add guest route restrictions |
| `core/src/app/(dashboard)/bernard/admin/users/page.tsx` | Modify | Role dropdown instead of admin checkbox |
| `core/src/agents/bernard/tools/types.ts` | Modify | Add `ToolContext` type |
| `core/src/agents/bernard/tools/validation.ts` | Modify | Filter tools based on role |
| `core/src/agents/bernard/tools/home-assistant-*.tool.ts` (4 files) | Modify | Mock behavior for guests |
| `core/src/agents/bernard/bernard.agent.ts` | Modify | Accept tool context |
| `core/src/app/api/users/[id]/route.ts` | Modify | Support role updates |
| `core/src/services/adminApi.ts` | Modify | Support role in updateUser |

**Total files to modify:** 13

---

## Open Questions

1. **Migration**: Should existing users with `isAdmin: false` be migrated to `role: "user"`? (Recommended: yes, during startup)

2. **Tool hiding vs mocking**: Should Overseerr tools be hidden or mocked? Request says "HIDDEN" - confirm.

3. **Guest access to chat**: Where should guests be redirected if they try to access restricted pages? `/bernard/chat`?

4. **First user**: Should first user still be admin, or should all new accounts default to guest and require admin promotion?

---

## Testing Checklist

- [ ] New OAuth user gets "guest" role
- [ ] Admin can change guest → user → admin
- [ ] Guest cannot access /bernard/user/* (redirected)
- [ ] Guest cannot access /status (redirected)
- [ ] Guest cannot see play_media_tv tool
- [ ] Guest cannot see overseerr tools
- [ ] Guest HA tool calls return mock success messages
- [ ] Non-guest users see all tools and functionality
- [ ] Admin users have full access
- [ ] Role changes persist correctly
