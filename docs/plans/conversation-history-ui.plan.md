# Conversation History UI Implementation Plan

## Overview

This document outlines the UI implementation for the conversation history feature, including:
- Updates to existing `conversation-history.plan.md` (new API endpoint)
- A new "Conversations" page in the user area
- A shared `ConversationListTable` component (reusable for user and admin views)
- A "View Conversation" page for reading past conversations
- Integration with existing patterns in the codebase

---

## Part A: Updates to conversation-history.plan.md

### New API Endpoint: List All Conversations (Admin Only)

**Endpoint:** `GET /api/conversations/all`

**Description:** Admin-only endpoint to retrieve all conversations across all users.

**Authentication:** Admin required (authenticated user with `isAdmin: true`)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| archived | boolean | false | Include archived conversations |
| limit | number | 50 | Maximum number of results |
| offset | number | 0 | Pagination offset |

**Response (200 OK):**
```json
{
  "conversations": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "",
      "description": "",
      "userId": "user-123",
      "userName": "John Doe",
      "createdAt": "2026-01-15T10:30:00.000Z",
      "lastTouchedAt": "2026-01-15T10:35:00.000Z",
      "archived": false,
      "messageCount": 5,
      "userAssistantCount": 4,
      "toolCallCount": 2
    }
  ],
  "total": 1,
  "hasMore": false
}
```

**Key Difference from User Endpoint:**
- Returns all conversations (not filtered by authenticated user)
- Includes `userName` field for display purposes

**Implementation Location:**
- **bernard:** Add new endpoint in `services/bernard/src/routes/conversations.ts`
- **proxy-api:** Add proxy route in `proxy-api/src/routes/conversations.ts`

---

## Part B: UI Implementation Plan

### 1. Shared ConversationListTable Component

**File:** `services/bernard-ui/src/components/conversation/ConversationListTable.tsx`

**Props Interface:**
```typescript
interface ConversationListTableProps {
  conversations: ConversationListItem[];
  showUserColumn?: boolean;  // If true, shows "User" column (admin view)
  onView?: (conversationId: string) => void;
  onArchive?: (conversationId: string) => void;
  onDelete?: (conversationId: string) => void;  // Admin only
  onCopyLink?: (conversationId: string) => void;
  loading?: boolean;
}

interface ConversationListItem {
  id: string;
  name?: string;              // Display name (or blank for ID fallback)
  userId: string;
  userName?: string;          // Only present when showUserColumn=true
  createdAt: string;
  messageCount: number;
  llmCallCount?: number;      // Derived from events in bernard-api
  toolCallCount: number;
  archived: boolean;
}
```

**Columns:**
| Column | Width | Description |
|--------|-------|-------------|
| | 48px | Eye button to view conversation (icon button, no border/background) |
| Name | auto | Conversation name, or truncated ID if blank |
| Created | 150px | Date/time of conversation creation |
| Stats | 100px | Format: `{messageCount}/{llmCallCount}/{toolCallCount}` |
| (Actions) | 50px | Vertical dots menu (View, Archive, Delete/Copy Link) |
| User (optional) | 150px | User name/display name (admin only) |

**Visual Features:**
- **Eye Icon Handling**: Icon button with no border/background (just the icon, clickable) for viewing conversations
- **Name Column**: Display conversation name, or truncated ID if blank (e.g., "550e8400-e29b-41d4...")
- **Date formatting**: Use `toLocaleDateString()` + `toLocaleTimeString()`
- **Stats column**: Format as "6/7/4" (messages/llm-calls/tool-calls)
- **Action menu**: Depends on context (user vs admin)

**Action Menu Items by Context:**

| Menu Item | User Page | Admin Page |
|-----------|-----------|------------|
| View | ✅ | ✅ |
| Archive | ✅ | ✅ |
| Delete | ❌ | ✅ |
| Copy Link | ✅ | ✅ |

**Styling Patterns:**
- Use existing `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` components
- Use `DropdownMenu` for action menu (consistent with History.tsx)
- Use `Button` with `variant="ghost"` for icon buttons
- Use `Badge` for archived status indicator

---

### 2. User Conversations Page

**File:** `services/bernard-ui/src/pages/user/Conversations.tsx`

**Location:** New file in `pages/user/` directory (create directory if needed)

**Features:**
- Header: "Conversations" title (no "New Chat" button needed - conversation ID auto-generated)
- Filter controls:
  - Toggle: "Include Archived" (checkbox or switch)
  - Limit/offset pagination via "Load More" button
- ConversationListTable component
- Only shows **own** conversations (filtered by authenticated user ID)
- Actions: Archive, Copy Link
- View opens read-only conversation detail

**Empty State:**
- When user has no conversations: Show "No conversations" message
- Conversation ID is auto-generated on page load so user can start typing immediately
- No redirect, no "Start new chat" button - just the empty list

**Layout Structure:**
```
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <h1 className="text-3xl font-bold">Conversations</h1>
  </div>

  <Card>
    <CardHeader>
      <CardTitle>Your Conversations</CardTitle>
      <CardDescription>View and manage your conversation history</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex items-center space-x-4 mb-4">
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={includeArchived} onChange={...} />
          <span>Include archived</span>
        </label>
      </div>
      <ConversationListTable
        conversations={conversations}
        showUserColumn={false}
        onView={handleViewConversation}
        onArchive={handleArchiveConversation}
        onCopyLink={handleCopyLink}
        loading={loading}
      />
      {hasMore && (
        <Button variant="outline" className="w-full mt-4" onClick={loadMore}>
          Load More
        </Button>
      )}
      {conversations.length === 0 && !loading && (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          No conversations yet. Start typing to begin.
        </div>
      )}
    </CardContent>
  </Card>
</div>
```

**Auto-Generate Conversation ID:**
- On page load, generate a conversation ID and store in localStorage
- This allows the user to immediately start typing in the chat without clicking "New Chat"
- The ID persists across refreshes until user explicitly starts a new conversation

**API Integration:**
- Call `apiClient.listConversations({ archived: includeArchived, limit, offset })`
- Handle loading states
- Handle errors with toast notifications

**Navigation:**
- Add to UserLayout sidebar navigation
- Route: `/conversations`
- View action: Navigate to `/conversations/:id`

**Copy Link:**
- Generate a shareable URL: `${window.location.origin}/bernard/conversations/${conversationId}`
- Copy to clipboard
- Show toast confirmation

---

### 3. User Conversation Detail Page

**File:** `services/bernard-ui/src/pages/user/ConversationDetail.tsx`

**Features:**
- Reuses existing `ChatInterface` component (read-only mode)
- Right sidebar panel with conversation metadata (clean, no bloat)
- Header with back button and conversation ID/name
- View-only mode (no input field, no send button)

**Layout Structure:**
```
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-4">
      <Button variant="outline" onClick={() => navigate('/conversations')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Conversations
      </Button>
      <div>
        <h1 className="text-3xl font-bold">
          {conversation?.name || 'Conversation'}
        </h1>
        <p className="text-gray-600 dark:text-gray-300 text-sm">
          {conversation?.id}
        </p>
      </div>
    </div>
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    {/* Chat Interface */}
    <div className="lg:col-span-2">
      <Card>
        <CardContent className="p-0 mt-6">
          <ChatInterface
            key={conversationId}
            initialMessages={convertedMessages}
            initialTraceEvents={[]}
            readOnly={true}
            height="h-auto"
          />
        </CardContent>
      </Card>
    </div>

    {/* Metadata Sidebar */}
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Created</span>
              <p className="font-medium">{formatDateTime(conversation.createdAt)}</p>
            </div>
            <div>
              <span className="text-gray-500">Last Activity</span>
              <p className="font-medium">{formatDateTime(conversation.lastTouchedAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <p className="font-medium">{conversation.messageCount}</p>
              <p className="text-xs text-gray-500">Messages</p>
            </div>
            <div className="text-center p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <p className="font-medium">{conversation.llmCallCount || '-'}</p>
              <p className="text-xs text-gray-500">LLM Calls</p>
            </div>
            <div className="text-center p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <p className="font-medium">{conversation.toolCallCount}</p>
              <p className="text-xs text-gray-500">Tools</p>
            </div>
          </div>

          {conversation.archived && (
            <Badge variant="secondary">Archived</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  </div>
</div>
```

**Metadata Panel Fields:**
- **Created**: Full date/time string
- **Last Activity**: Full date/time string
- **Stats Grid**: 3-box layout (Messages / LLM Calls / Tools)
- **Status Badges**: Archived
- Clean, minimal design without bloat

**API Integration:**
- Call `apiClient.getConversation(conversationId)` to fetch conversation and events
- Convert events to messages for ChatInterface compatibility
- Handle loading states
- Handle "not found" errors

---

### 4. Admin Conversations Page (Redesign from Scratch)

**File:** `services/bernard-ui/src/pages/admin/History.tsx` (REDESIGN)

**Changes:**
- Redesign entirely to use new `ConversationListTable` component
- Update to use new API endpoint (`GET /api/conversations/all`)
- Enable `showUserColumn={true}`
- Keep delete functionality (admin only)
- Actions: Archive, Delete, Copy Link
- No indexing/status features (simplified for clarity)

**API Changes:**
- Replace `adminApiClient.listHistory()` with new `adminApiClient.listAllConversations()`
- Update response type to match `ConversationListItem`

---

### 5. Admin Conversation Detail Page (Updates to Existing)

**File:** `services/bernard-ui/src/pages/admin/ConversationDetail.tsx` (MODIFY)

**Changes:**
- May need updates if conversation model changes
- Keep existing features (indexing, debug info, etc.)
- Reuse patterns from user version where applicable

---

### 6. Navigation Updates

**UserLayout.tsx:** Add "Conversations" to sidebar navigation

```typescript
const navigation = [
  { name: 'Chat', href: '/chat', icon: MessagesSquare },
  { name: 'Conversations', href: '/conversations', icon: History },  // NEW
  { name: 'Tasks', href: '/tasks', icon: ListTodo },
  { name: 'Keys', href: '/keys', icon: Key },
  { name: 'About', href: '/about', icon: Info },
];
```

**App.tsx:** Add routes

```typescript
<Route path="conversations" element={<Conversations />} />
<Route path="conversations/:id" element={<ConversationDetail />} />
```

---

### 7. API Client Updates

**File:** `services/bernard-ui/src/services/api.ts`

**Add Methods:**
```typescript
// List user's conversations
async listConversations(options: {
  archived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{
  conversations: ConversationListItem[];
  total: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams({
    archived: String(options.archived ?? false),
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });

  return this.request(`/conversations?${params}`);
}

// Get single conversation with events
async getConversation(conversationId: string): Promise<{
  conversation: ConversationMetadata;
  events: ConversationEvent[];
}> {
  return this.request(`/conversations/${conversationId}`);
}

// Archive conversation
async archiveConversation(conversationId: string): Promise<void> {
  return this.request(`/conversations/${conversationId}/archive`, {
    method: 'POST',
  });
}
```

**File:** `services/bernard-ui/src/services/adminApi.ts`

**Add Methods:**
```typescript
// List all conversations (admin only)
async listAllConversations(options: {
  archived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{
  conversations: ConversationListItem[];
  total: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams({
    archived: String(options.archived ?? false),
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
  });

  return this.request(`/conversations/all?${params}`);
}
```

---

## Part C: Type Definitions

### New Types for UI

```typescript
// Conversation list item (shared between user and admin views)
interface ConversationListItem {
  id: string;
  name?: string;              // Display name (optional)
  description?: string;       // Description (optional)
  userId: string;
  userName?: string;          // Only for admin view
  createdAt: string;
  lastTouchedAt: string;
  archived: boolean;
  messageCount: number;
  llmCallCount?: number;      // Number of LLM calls in conversation
  toolCallCount: number;
}

// Conversation metadata
interface ConversationMetadata {
  id: string;
  name?: string;
  description?: string;
  userId: string;
  createdAt: string;
  lastTouchedAt: string;
  archived: boolean;
  archivedAt?: string;
  messageCount: number;
  userAssistantCount: number;
  toolCallCount: number;
  errorCount?: number;
}

// Conversation event (for detail view)
interface ConversationEvent {
  id: string;
  type: 'user_message' | 'llm_call' | 'llm_response' | 'tool_call' | 'tool_response' | 'assistant_message';
  timestamp: string;
  data: Record<string, unknown>;
}
```

---

## Part D: File Structure

```
services/bernard-ui/
├── src/
│   ├── components/
│   │   └── conversation/
│   │       └── ConversationListTable.tsx  # NEW: Shared table component
│   ├── pages/
│   │   └── user/
│   │       ├── Conversations.tsx          # NEW: User conversations list
│   │       └── ConversationDetail.tsx     # NEW: User conversation view
│   ├── services/
│   │   └── api.ts                         # MODIFY: Add list/get/archive methods
│   └── App.tsx                            # MODIFY: Add routes
└── ...

services/bernard/
└── src/
    └── routes/
        └── conversations.ts               # NEW: Add GET /all endpoint

proxy-api/
└── src/
    └── routes/
        └── conversations.ts               # MODIFY: Add proxy for /all
```

---

## Part E: Implementation Phases

### Phase 1: Backend API Updates
1. Add `GET /api/conversations/:id` endpoint to bernard
2. Add `GET /api/conversations` endpoint to bernard (user's own conversations)
3. Add `GET /api/conversations/all` endpoint to bernard (admin only)
4. Add `POST /api/conversations/:id/archive` endpoint to bernard
5. Add proxy routes in proxy-api

### Phase 2: UI Components
1. Create `ConversationListTable.tsx` component
2. Create types file for conversation types
3. Update `api.ts` with new methods
4. Update `adminApi.ts` with new methods

### Phase 3: User Pages
1. Create `pages/user/Conversations.tsx`
2. Create `pages/user/ConversationDetail.tsx`
3. Update `UserLayout.tsx` with navigation
4. Update `App.tsx` with routes

### Phase 4: Admin Updates
1. Update `pages/admin/History.tsx` to use ConversationListTable
2. Update `adminApi.ts` with new methods
3. Test admin functionality

### Phase 5: Testing
1. Unit tests for ConversationListTable
2. Integration tests for API endpoints
3. Manual testing of user flow
4. Manual testing of admin flow

---

## Part F: Visual Design Reference

### ConversationListTable Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ┌───────┬────────────────────────────────┬──────────────────┬──────────┬────────┬───┤
│  │       │ Name                           │ Created          │ Stats    │        │   │
│  ├───────┼────────────────────────────────┼──────────────────┼──────────┼────────┼───┤
│  │ [👁]  │ My Weather Chat                │ Jan 15, 2026     │ 6/7/4    │        │ ⋮ │
│  │       │ 550e8400-e29b...               │ 10:30 AM         │          │        │   │
│  ├───────┼────────────────────────────────┼──────────────────┼──────────┼────────┼───┤
│  │ [👻]  │                                │ Jan 14, 2026     │ 2/1/0    │        │ ⋮ │
│  │       │ 12345678-1234...               │ 3:45 PM          │          │        │   │
│  ├───────┼────────────────────────────────┼──────────────────┼──────────┼────────┼───┤
│  │ [👁]  │ Timer Conversation             │ Jan 13, 2026     │ 4/3/2    │        │ ⋮ │
│  │       │ abcdefgh-1234...               │ 9:00 AM          │          │        │   │
│  └───────┴────────────────────────────────┴──────────────────┴──────────┴────────┴───┘
│                                                                                       │
│  [Include archived]  [Load More]                                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Admin Version Adds User Column:**
```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  ┌───────┬────────────────────────────────┬──────────────────┬──────────┬──────────────┬────────┬───┤
│  │       │ Name                           │ Created          │ Stats    │ User         │        │   │
│  ├───────┼────────────────────────────────┼──────────────────┼──────────┼──────────────┼────────┼───┤
│  │ [👁]  │ My Weather Chat                │ Jan 15, 2026     │ 6/7/4    │ John Doe     │        │ ⋮ │
│  │       │ 550e8400-e29b...               │ 10:30 AM         │          │ user-123     │        │   │
│  └───────┴────────────────────────────────┴──────────────────┴──────────┴──────────────┴────────┴───┘
```

### Action Menu Items by Context

| Menu Item | User Page | Admin Page |
|-----------|-----------|------------|
| View | ✅ Eye icon, clickable | ✅ Eye icon, clickable |
| Archive | ✅ | ✅ |
| Delete | ❌ | ✅ |
| Copy Link | ✅ | ✅ |

**Copy Link Implementation:**
```typescript
const handleCopyLink = async (conversationId: string) => {
  const link = `${window.location.origin}/bernard/conversations/${conversationId}`;
  await navigator.clipboard.writeText(link);
  toast.success('Link copied to clipboard');
};
```

---

## Part G: Integration with Existing Code

### Reuse Existing Components

- **ChatInterface**: Already supports `readOnly={true}`, use for detail view
- **Table components**: Use existing shadcn/ui Table, TableRow, etc.
- **Card**: Use existing Card, CardHeader, CardContent
- **Button**: Use existing Button with variants
- **Badge**: Use existing Badge for status indicators
- **DropdownMenu**: Use existing for action menu
- **Dialogs**: Use existing confirm dialog for delete/archival confirmation

### Existing Patterns to Follow

From `History.tsx`:
- Loading state with spinner
- Empty state handling
- Action handlers with confirm dialogs
- Toast notifications for success/error

From `Users.tsx`:
- Table column layout
- Dropdown menu structure
- Form handling (not needed here but good reference)

From `ConversationDetail.tsx`:
- ChatInterface integration
- Metadata display patterns

---

## Potential Pitfalls

The following issues may be encountered during implementation. Solutions are provided as guidance; the implementing agent has flexibility to adapt as needed.

| Difficulty | Issue | Description | Possible Approaches |
|------------|-------|-------------|---------------------|
| **High** | Event to message conversion | Converting recorded events back to `MessageRecord` format for ChatInterface may have edge cases with complex event structures. | Map events directly to messages where possible, create a fallback renderer for unrecognized event types, or limit conversation viewing to simpler message types only. |
| **Medium** | Large conversation rendering | Loading hundreds of events in the ChatInterface could cause performance issues. | Implement virtualization (only render visible messages), paginate events in the detail view, add a warning for very large conversations, or simplify the display for old events. |
| **Medium** | Race conditions with localStorage | Multiple tabs could generate different conversation IDs, causing confusion. | Use storage events to sync across tabs, check for existing ID before generating new one, or accept that each tab can have its own conversation. |
| **Medium** | URL construction for copy link | Different deployment paths (basename, subdirectory) could break link generation. | Use `window.location` to construct dynamic base URL, add a config for basename, or always use absolute URLs. |
| **Low** | Empty vs loading state | Distinguishing between "no conversations" and "still loading" visually. | Use a loading spinner first, then show empty state, add skeleton loader, or clearly label states with text. |
| **Medium** | ChatInterface compatibility | The existing ChatInterface may expect certain message fields that events don't provide. | Extend the `MessageRecord` type to accommodate event data, create a wrapper/mapper layer, or render events differently from messages. |
| **Medium** | Admin table simplification | Removing indexing features might break existing admin workflows. | Keep the old History page as "Advanced History", move features to a "Debug" tab on the detail page, or add features back incrementally based on feedback. |
| **Low** | Type mismatches between API responses | API might return different field names or types than expected. | Add runtime validation (Zod or similar), normalize responses in the API client layer, or update types to match actual API response. |
| **Low** | Toast notifications | Multiple rapid actions could cause toast stacking issues. | Debounce toast display, use a toast queue, or limit to one active toast at a time. |
| **Medium** | Date formatting consistency | Different date formats across list and detail views. | Use a shared date utility function, create a `formatConversationDate` helper, or rely on browser's `toLocaleString` with consistent options. |

### Recommendations

- Test with realistic conversation sizes (100+ messages) early to catch performance issues
- Start with the simplest conversion logic for events → messages, iterate based on edge cases
- Consider adding a "simplified mode" for very old or very large conversations
- Use the existing `useConfirmDialog` pattern consistently for destructive actions

---

## Part H: Open Questions (Resolved)

| # | Question | Resolution |
|---|----------|------------|
| 1 | LLM call count tracking | Count from events in bernard-api (SSOT) |
| 2 | UserName in admin list | Store in metadata at conversation creation |
| 3 | Name/description | Leave blank (UI/automations will set later) |
| 4 | Pagination style | "Load More" button |
| 5 | Ghost mode in list | Eye icon with no border/background, clickable |
| 6 | Admin table features | Redesign from scratch, simplify |
| 7 | User page actions | Archive, Copy Link (no delete) |
| 8 | Empty state | Message only, conversation ID auto-generated |

---

## Part I: Related Plans

This plan is related to:
- `docs/plans/conversation-history.plan.md` - Backend implementation
- Future plan for conversation editing features (TBD)

---

## Approval

This plan is ready for implementation pending approval.

**Status:** Draft

**Last Updated:** 2026-01-01

**Author:** AI Planning Assistant
