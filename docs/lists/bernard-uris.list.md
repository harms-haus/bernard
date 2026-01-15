# Bernard UI Frontend URIs List

**Generated:** Thu Jan 15 2026
**Purpose:** List of all frontend routes/links used in bernard-ui that need `/bernard/` prefix

---

## 1. App.tsx - Route Definitions

File: `services/bernard-ui/src/App.tsx`

| Line | Route | Notes |
|------|-------|-------|
| 37 | `<Router basename="/bernard/">` | Router basename already set |
| 40 | `/login` | Redirects to `/auth/login` |
| 44-57 | `/` | UserLayout with nested routes (Home as index) |
| 51 | (index) | Home page - renders at `/` |
| 52 | `chat` | Chat page - renders at `/chat` |
| 53 | `tasks` | Tasks page - renders at `/tasks` |
| 54 | `tasks/:id` | Task detail page - renders at `/tasks/:id` |
| 55 | `profile` | Profile page - renders at `/profile` |
| 56 | `keys` | Keys page - renders at `/keys` |
| 57 | `about` | About page - renders at `/about` |
| 61 | `/status` | Public status page |
| 64-79 | `/admin` | AdminLayout with nested routes |
| 74 | (index) | Dashboard - renders at `/admin` |
| 75 | `models` | Models page - renders at `/admin/models` |
| 76 | `services` | Services page - renders at `/admin/services` |
| 77 | `users` | Users page - renders at `/admin/users` |
| 78 | `automations` | Automations page - renders at `/admin/automations` |

---

## 2. UserLayout.tsx - Navigation Links

File: `services/bernard-ui/src/components/UserLayout.tsx`

| Line | URI | Context |
|------|-----|---------|
| 18 | `/chat` | Navigation item: "Chat" |
| 19 | `/tasks` | Navigation item: "Tasks" |
| 20 | `/keys` | Navigation item: "Keys" |
| 21 | `/about` | Navigation item: "About" |
| 43 | `/` | Logo link to home |
| 86 | `/admin` | Admin link (only for admins) |
| 115 | `/` | Mobile header logo link to home |

---

## 3. AdminLayout.tsx - Navigation Links

File: `services/bernard-ui/src/components/AdminLayout.tsx`

| Line | URI | Context |
|------|-----|---------|
| 21 | `/admin` | Navigation item: "Status" (dashboard index) |
| 22 | `/admin/models` | Navigation item: "Models" |
| 23 | `/admin/services` | Navigation item: "Services" |
| 24 | `/admin/automations` | Navigation item: "Automations" |
| 25 | `/admin/history` | Navigation item: "History" |
| 26 | `/admin/users` | Navigation item: "Users" |
| 60 | `/` | "Back to Home" link in Access Denied card |
| 65 | `/profile` | Profile button via `window.location.href` |
| 126 | `/chat` | "Main Chat" button (via navigate()) |

---

## 4. Tasks.tsx - Links

File: `services/bernard-ui/src/pages/Tasks.tsx`

| Line | URI | Context |
|------|-----|---------|
| 71 | `/api/tasks` | API call (NOT a route - exclude from changes) |
| 111 | `/api/tasks` | API call (NOT a route - exclude from changes) |
| 143 | `/api/tasks?taskId=...` | API call (NOT a route - exclude from changes) |
| 275 | `/tasks/${task.id}` | Link to task detail page |

---

## 5. TaskDetail.tsx - Links

File: `services/bernard-ui/src/pages/TaskDetail.tsx`

| Line | URI | Context |
|------|-----|---------|
| 147 | `/api/tasks/${id}` | API call (NOT a route - exclude from changes) |
| 244 | `/tasks` | Back link to tasks list |
| 264 | `/tasks` | Back link to tasks list |

---

## 6. UserBadge.tsx - Navigation

File: `services/bernard-ui/src/components/UserBadge.tsx`

| Line | URI | Context |
|------|-----|---------|
| 13 | `/login` | navigate() call on logout |
| 20 | `/profile` | navigate() call to profile |
| 24 | `/keys` | navigate() call to keys |

---

## 7. ProtectedRoute.tsx - Redirects

File: `services/bernard-ui/src/components/ProtectedRoute.tsx`

| Line | URI | Context |
|------|-----|---------|
| 29 | `/auth/login?redirect=...` | Redirect to core auth login (NOT a route, stays as-is) |

---

## 8. ConversationHistory.tsx - Links

File: `services/bernard-ui/src/components/chat/ConversationHistory.tsx`

| Line | URI | Context |
|------|-----|---------|
| 377 | `/admin` | Admin Dashboard link (only for admins) |

---

## 9. vite.config.ts - Base Configuration

File: `services/bernard-ui/vite.config.ts`

| Line | Config | Notes |
|------|--------|-------|
| 8 | `base: '/bernard/'` | Already set correctly |

---

## Summary

### Routes to Update (Need `/bernard/` prefix)

| URI | Count | Files |
|-----|-------|-------|
| `/` | 4 | App.tsx, UserLayout.tsx (x2), AdminLayout.tsx |
| `/login` | 2 | App.tsx, UserBadge.tsx |
| `/chat` | 3 | App.tsx, UserLayout.tsx, AdminLayout.tsx |
| `/chat/:threadId` | 1 | App.tsx (via React Router) |
| `/tasks` | 4 | App.tsx, Tasks.tsx, TaskDetail.tsx (x2) |
| `/tasks/:id` | 2 | App.tsx, Tasks.tsx |
| `/profile` | 2 | App.tsx, UserBadge.tsx |
| `/keys` | 2 | App.tsx, UserBadge.tsx |
| `/about` | 2 | App.tsx, UserLayout.tsx |
| `/status` | 2 | App.tsx, vite.config.ts |
| `/admin` | 4 | App.tsx, UserLayout.tsx, AdminLayout.tsx, ConversationHistory.tsx |
| `/admin/models` | 2 | App.tsx, AdminLayout.tsx |
| `/admin/services` | 2 | App.tsx, AdminLayout.tsx |
| `/admin/users` | 2 | App.tsx, AdminLayout.tsx |
| `/admin/automations` | 2 | App.tsx, AdminLayout.tsx |
| `/admin/history` | 2 | AdminLayout.tsx (navigation), adminApi.ts |

### Exclusions (Do NOT change)

| URI | Reason |
|-----|--------|
| `/api/*` | API calls to core proxy |
| `/auth/*` | Authentication endpoints (core handles these) |
| `/v1/*` | LangGraph API endpoints |
| `/threads/*` | LangGraph API endpoints |
| `/status` proxy | Already correctly configured in vite.config.ts |

---

## Router Basename Status

The router in `App.tsx` already has `basename="/bernard/"` set at line 37:
```tsx
<Router basename="/bernard/">
```

This means React Router will automatically prefix all routes with `/bernard/`. However, when using:
- `navigate()` calls
- `window.location.href` redirects
- Manual `Link to="..."` components

These need to include the `/bernard/` prefix manually because:
1. `navigate()` doesn't automatically use the basename
2. `window.location.href` is a full redirect (not routed)
3. `Link to="..."` components DO use the basename automatically

### Current Behavior:
- `<Link to="/chat">` → renders as `/bernard/chat` ✓
- `navigate('/chat')` → navigates to `/chat` (wrong, should be `/bernard/chat`)
- `window.location.href = '/auth/login'` → redirects to `/auth/login` (correct, auth is outside basename)

---

## Required Changes

1. **navigate() calls** in UserBadge.tsx and AdminLayout.tsx must include `/bernard/` prefix
2. **Verify Link components** - they should automatically work with basename
3. **vite.config.ts** - base is already set to `/bernard/`
4. **No changes needed** for:
   - API calls (`/api/*`, `/auth/*`, `/v1/*`, `/threads/*`)
   - React Router Routes (handled by basename)
   - React Router Link components (handled by basename)
