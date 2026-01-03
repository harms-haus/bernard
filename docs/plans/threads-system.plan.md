# Thread Persistence Implementation Plan

## Executive Summary

**Goal**: Replace the conversation recording system entirely with LangGraph's native thread persistence using Redis checkpointer. No backward compatibility.

**Key Changes**:
1. Install `@langchain/langgraph-checkpoint-redis` 
2. Replace `MemorySaver` with Redis checkpointer
3. Rename conversation utilities to thread utilities
4. Remove all `/api/conversations/*` endpoints
5. Thread ID becomes the primary conversation identifier

---

## Architecture Decision Record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence Layer | Redis Checkpointer (@langchain/langgraph-checkpoint-redis) | Official LangGraph Redis support, production-ready |
| Thread ID Source | Reuse existing conversationId generator, rename to threadId | Consistent with LangGraph terminology, UUID v4 |
| Migration Strategy | Fresh start, no data migration | Conversation recording system is defunct, traces remain for debugging |
| Backward Compatibility | None | Complete replacement per user requirement |

---

## Current State Analysis

### Existing Components to Remove

| Component | Location | Status |
|-----------|----------|--------|
| ConversationRecordKeeper | `services/bernard/lib/conversation/conversationRecorder.ts` | Defunct, never fully implemented |
| Conversation API Endpoints | `proxy-api/src/routes/conversations.ts` | Never called by UI |
| Conversation Types | `services/bernard-ui/src/types/conversation.ts` | Unused |
| Conversation ID Utilities | `services/bernard-ui/src/utils/conversationId.ts` | Active, needs rename |
| Conversation Plans | `docs/plans/conversation-history*.plan.md` | Drafts, never implemented |
| Conversation UI Pages | Various pages under `pages/user/` | Never created |

### Existing Components to Modify

| Component | Location | Change |
|-----------|----------|--------|
| MemorySaver Checkpointer | `services/bernard/server.ts:28` | Replace with Redis checkpointer |
| AgentContext | `services/bernard/src/agent/agentContext.ts` | Update type import |
| ChatInterface | `services/bernard-ui/src/components/ChatInterface.tsx` | Use threadId terminology |
| API Client | `services/bernard-ui/src/services/api.ts` | Remove conversationId parameters |

### Components to Keep (Unchanged)

| Component | Location | Rationale |
|-----------|----------|-----------|
| Bernard Graph | `services/bernard/src/agent/graph/bernard.graph.ts` | Already supports thread_id config |
| Traces | `services/bernard/src/agent/trace/` | Used for debugging, not user-facing |
| Redis Infrastructure | `services/bernard/src/lib/infra/redis.ts` | Shared dependency |

---

## Phase 1: Redis Checkpointer Setup

### 1.1 Install Redis Checkpointer Package

```bash
cd /home/blake/Documents/software/bernard/services/bernard
npm install @langchain/langgraph-checkpoint-redis
```

### 1.2 Create Checkpointer Initialization

**File**: `services/bernard/src/lib/checkpointer/redis.ts`

```typescript
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { getRedis } from "@/lib/infra/redis";

let redisCheckpointer: RedisSaver | null = null;

export async function getRedisCheckpointer(): Promise<RedisSaver> {
  if (!redisCheckpointer) {
    const redis = getRedis();
    redisCheckpointer = new RedisSaver({ client: redis });
  }
  return redisCheckpointer;
}

export async function closeRedisCheckpointer(): Promise<void> {
  if (redisCheckpointer) {
    await redisCheckpointer.client.quit();
    redisCheckpointer = null;
  }
}
```

**Key Design Decisions**:
- Singleton pattern to reuse checkpointer instance
- Lazy initialization to avoid startup failures if Redis unavailable
- Explicit cleanup on graceful shutdown

### 1.3 Update AgentContext Type

**File**: `services/bernard/src/agent/agentContext.ts`

```typescript
import type { BaseCheckpointSaver } from "@langchain/langgraph";
// Remove MemorySaver import, use BaseCheckpointSaver instead

export interface AgentContext {
  checkpointer: BaseCheckpointSaver;
  tools: Array<StructuredTool>;
  disabledTools: Array<string>;
  logger: Logger;
  tracer: Tracer;
}
```

### 1.4 Update Server to Use Redis Checkpointer

**File**: `services/bernard/server.ts`

**Before**:
```typescript
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();
```

**After**:
```typescript
import { getRedisCheckpointer } from "@/lib/checkpointer/redis";

let checkpointer: BaseCheckpointSaver;

async function initializeCheckpointer() {
  checkpointer = await getRedisCheckpointer();
}

initializeCheckpointer().catch((error) => {
  logger.error({ error }, "Failed to initialize Redis checkpointer");
  process.exit(1);
});
```

**Update graceful shutdown** (around line 278):
```typescript
// After Redis quit:
await closeRedisCheckpointer();
```

---

## Phase 2: Thread ID Generator (Reuse conversation ID logic)

### 2.1 Rename conversationId utility

**File**: `services/bernard-ui/src/utils/conversationId.ts` → `services/bernard-ui/src/utils/threadId.ts`

**Content**:
```typescript
/**
 * Thread ID management utilities
 * 
 * Thread IDs are UUIDs used by LangGraph to persist conversation state.
 * They are generated client-side and stored in localStorage for continuity.
 */

export interface ThreadIdUtils {
  generate: () => string;
  getStored: () => string | null;
  setStored: (id: string) => void;
  clearStored: () => void;
}

/**
 * Generate a new thread ID using the browser's crypto API
 */
export function generateThreadId(): string {
  return crypto.randomUUID();
}

/**
 * Storage key for thread ID
 */
const THREAD_ID_KEY = 'bernard_thread_id';

/**
 * Get current thread ID from localStorage
 */
export function getStoredThreadId(): string | null {
  return localStorage.getItem(THREAD_ID_KEY);
}

/**
 * Set thread ID in localStorage
 */
export function setStoredThreadId(id: string): void {
  localStorage.setItem(THREAD_ID_KEY, id);
}

/**
 * Clear thread ID from localStorage (when starting fresh conversation)
 */
export function clearStoredThreadId(): void {
  localStorage.removeItem(THREAD_ID_KEY);
}
```

### 2.2 Update All UI Imports

**Files to update**:
- `services/bernard-ui/src/components/ChatInterface.tsx`
- `services/bernard-ui/src/services/api.ts`
- Any other files importing conversationId utilities

**Before**:
```typescript
import { generateConversationId, getStoredConversationId, setStoredConversationId } from '../utils/conversationId';
```

**After**:
```typescript
import { generateThreadId, getStoredThreadId, setStoredThreadId, clearStoredThreadId } from '../utils/threadId';
```

### 2.3 Update API Client

**File**: `services/bernard-ui/src/services/api.ts`

**Remove conversation-related parameters and methods**:
- Remove `conversationId` from `chatStream()` and `chat()` methods
- Remove `listConversations()` method
- Remove `getConversation()` method
- Remove `archiveConversation()` method

**Before**:
```typescript
async chatStream(
  messages: ConversationMessage[],
  signal?: AbortSignal,
  conversationId?: string
): Promise<ReadableStream> {
  const body: any = {
    model: 'bernard-v1',
    messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
    stream: true,
  };
  if (conversationId) body.conversationId = conversationId;
  // ...
}
```

**After**:
```typescript
async chatStream(
  messages: ConversationMessage[],
  signal?: AbortSignal
): Promise<ReadableStream> {
  const body = {
    model: 'bernard-v1',
    messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
    stream: true,
  };
  // conversationId removed - LangGraph handles persistence via chatId
  // ...
}
```

---

## Phase 3: Remove Conversation Recording System

### 3.1 Remove Backend Files

```bash
# Remove conversation recorder if exists
rm -f services/bernard/lib/conversation/conversationRecorder.ts
rm -f services/bernard/tests/conversationRecorder.test.ts

# Remove conversation keeper from bernard-api if exists
rm -f services/bernard-api/src/lib/conversationKeeper.ts
rm -f services/bernard-api/src/routes/conversations.ts
rm -f services/bernard-api/src/types/conversations.ts

# Remove from TypeScript config paths if referenced
```

### 3.2 Remove Proxy API Routes

**File**: `proxy-api/src/routes/conversations.ts` → Delete entire file

**Update**: `proxy-api/src/routes/index.ts`

**Before**:
```typescript
import { registerConversationRoutes } from './routes/conversations';

export async function registerRoutes(fastify: FastifyInstance) {
  registerConversationRoutes(fastify);
  // ...
}
```

**After**:
```typescript
// Remove registerConversationRoutes import and call
```

### 3.3 Remove UI Types and Components

```bash
# Remove types
rm -f services/bernard-ui/src/types/conversation.ts

# Remove conversation-specific pages if created
rm -f services/bernard-ui/src/pages/user/Conversations.tsx
rm -f services/bernard-ui/src/pages/user/ConversationDetail.tsx
rm -f services/bernard-ui/src/components/conversation/ConversationListTable.tsx
```

### 3.4 Archive Old Documentation

```bash
# Move conversation plans to archive
mkdir -p docs/archive
mv docs/plans/conversation-history.plan.md docs/archive/
mv docs/plans/conversation-history-ui.plan.md docs/archive/
```

**Create marker file**: `docs/plans/conversation-history.plan.md`

```markdown
# Archived: Conversation History Implementation Plan

This plan has been superseded by the Thread Persistence implementation.

See: `docs/plans/threads-system.plan.md`

**Reason**: The conversation recording system was never fully implemented
and is being replaced by LangGraph's native thread persistence.

**Status**: Archived January 2026
```

---

## Phase 4: Update Server Thread ID Handling

### 4.1 Use Thread ID from Request or Generate

**File**: `services/bernard/server.ts`

**Before** (lines 106-107):
```typescript
const threadId = body.chatId || `thread_${Date.now()}`;
const conversationId = body.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

**After**:
```typescript
const threadId = body.chatId || `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
// conversationId removed entirely - chatId is the thread identifier
```

**Remove conversationId from tracer** (line 113):
```typescript
// Before:
tracer.requestStart({
  id: requestId,
  conversationId: conversationId,
  model: body.model ?? BERNARD_MODEL_ID,
  agent: "bernard",
  messages: inputMessages,
});

// After:
tracer.requestStart({
  id: requestId,
  threadId: threadId,
  model: body.model ?? BERNARD_MODEL_ID,
  agent: "bernard",
  messages: inputMessages,
});
```

### 4.2 Verify Graph Thread ID Configuration

**File**: `services/bernard/src/agent/graph/bernard.graph.ts` (should already be correct)

```typescript
export async function *runBernardGraph(
  graph: Awaited<ReturnType<typeof createBernardGraph>>,
  messages: BaseMessage[],
  stream: boolean,
  threadId: string
): AsyncIterable<{ type: string; content: unknown }> {
  const config = { configurable: { thread_id: threadId } };
  // ...
}
```

**Verification**: The graph is compiled with checkpointer and receives thread_id in config. ✓

---

## Phase 5: UI Updates for Thread Terminology

### 5.1 Update Navigation and Routes

**File**: `services/bernard-ui/src/App.tsx`

**Remove conversation routes**:
```typescript
// Remove:
<Route path="conversations" element={<Conversations />} />
<Route path="conversations/:id" element={<ConversationDetail />} />
```

**File**: `services/bernard-ui/src/components/layout/UserLayout.tsx`

**Remove conversation navigation item if present**:
```typescript
// Before:
const navigation = [
  { name: 'Chat', href: '/chat', icon: MessagesSquare },
  { name: 'Conversations', href: '/conversations', icon: History },
  { name: 'Tasks', href: '/tasks', icon: ListTodo },
  // ...
];

// After:
const navigation = [
  { name: 'Chat', href: '/chat', icon: MessagesSquare },
  { name: 'Tasks', href: '/tasks', icon: ListTodo },
  // ...
];
```

### 5.2 Update Chat Interface

**File**: `services/bernard-ui/src/components/ChatInterface.tsx`

**Update state initialization**:
```typescript
// Before:
const [conversationId, setConversationId] = useState<string>(() => {
  const stored = getStoredConversationId();
  if (stored) return stored;
  const newId = generateConversationId();
  setStoredConversationId(newId);
  return newId;
});

// After:
const [threadId, setThreadId] = useState<string>(() => {
  const stored = getStoredThreadId();
  if (stored) return stored;
  const newId = generateThreadId();
  setStoredThreadId(newId);
  return newId;
});
```

**Update "New Chat" handler**:
```typescript
// Before:
const handleNewChat = async () => {
  const newConversationId = generateConversationId();
  setCurrentConversationId(newConversationId);
  setStoredConversationId(newConversationId);
  // ...
};

// After:
const handleNewChat = async () => {
  const newThreadId = generateThreadId();
  setStoredThreadId(newThreadId);
  setThreadId(newThreadId);
  // Clear messages and other state...
};
```

**Pass threadId to API calls**:
```typescript
// Update the chatStream call to pass chatId instead of conversationId
const stream = await apiClient.chatStream(
  messages.concat(userMessage),
  abortController.signal,
  threadId  // Changed from conversationId → chatId parameter
);
```

### 5.3 Update API Methods

**File**: `services/bernard-ui/src/services/api.ts`

**Update chatStream method**:
```typescript
// Before:
async chatStream(
  messages: ConversationMessage[],
  signal?: AbortSignal,
  conversationId?: string
): Promise<ReadableStream> {
  const response = await fetch(`/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'bernard-v1',
      messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
      stream: true,
      ...(conversationId ? { conversationId } : {})
    }),
    signal
  });
  // ...
}

// After:
async chatStream(
  messages: ConversationMessage[],
  signal?: AbortSignal,
  chatId?: string  // Renamed from conversationId
): Promise<ReadableStream> {
  const response = await fetch(`/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'bernard-v1',
      messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
      stream: true,
      ...(chatId ? { chatId } : {})  // Changed from conversationId → chatId
    }),
    signal
  });
  // ...
}
```

**Remove conversation management methods**:
- `async listConversations(...)`
- `async getConversation(...)`
- `async archiveConversation(...)`

---

## Phase 6: Cleanup and Testing

### 6.1 Optional Redis Key Cleanup

For a fresh start, existing conversation Redis keys can be left as-is (they'll expire naturally) or manually cleaned:

```bash
redis-cli KEYS "bernard:conversation:*" | xargs redis-cli DEL
```

**Note**: This only removes the defunct conversation recording keys. Thread checkpoints use different key patterns managed by the Redis checkpointer.

### 6.2 Run Type Checks

```bash
# Bernard service
cd /home/blake/Documents/software/bernard/services/bernard
npm run type-check

# Bernard UI
cd /home/blake/Documents/software/bernard/services/bernard-ui
npm run type-check

# Proxy API
cd /home/blake/Documents/software/bernard/proxy-api
npm run type-check
```

**Expected**: All type checks pass with no errors related to conversation → thread renaming.

### 6.3 Test End-to-End Flow

**Test 1: New conversation creates thread**
1. Start Redis and bernard service
2. Send chat request WITHOUT chatId
3. Response includes thread_id in X-Thread-Id header (add this header)
4. Verify new thread checkpoint created in Redis

**Test 2: Same thread restores conversation**
1. Send second request WITH previous chatId
2. Verify LangGraph loads previous messages from checkpoint
3. Verify conversation continuity

**Test 3: Graceful shutdown preserves state**
1. Start conversation, send 2-3 messages
2. Restart bernard service (Redis stays running)
3. Send request with same chatId
4. Verify conversation restored from Redis checkpoint

**Test 4: Different threads are independent**
1. Send request with chatId=A, get response
2. Send request with chatId=B
3. Verify B doesn't contain A's messages
4. Verify A doesn't contain B's messages

### 6.4 Run Linting

```bash
cd /home/blake/Documents/software/bernard/services/bernard
npm run lint

cd /home/blake/Documents/software/bernard/services/bernard-ui
npm run lint

cd /home/blake/Documents/software/bernard/proxy-api
npm run lint
```

**Expected**: All lint checks pass.

---

## Files Summary

### To Create

| File | Purpose |
|------|---------|
| `services/bernard/src/lib/checkpointer/redis.ts` | Redis checkpointer initialization with singleton pattern |
| `services/bernard-ui/src/utils/threadId.ts` | Thread ID utilities (renamed from conversationId) |

### To Modify

| File | Change |
|------|--------|
| `services/bernard/server.ts` | Use Redis checkpointer, update thread ID handling, remove conversationId |
| `services/bernard/src/agent/agentContext.ts` | Update type import from MemorySaver to BaseCheckpointSaver |
| `services/bernard/src/agent/graph/bernard.graph.ts` | Already compatible - verify thread_id config |
| `services/bernard-ui/src/components/ChatInterface.tsx` | Update to use threadId terminology throughout |
| `services/bernard-ui/src/services/api.ts` | Rename conversationId → chatId, remove conversation management methods |
| `proxy-api/src/routes/index.ts` | Remove conversation routes registration |

### To Delete

| File | Rationale |
|------|-----------|
| `proxy-api/src/routes/conversations.ts` | Conversation endpoints superseded by thread persistence |
| `services/bernard-api/src/routes/conversations.ts` | If exists, unused endpoint |
| `services/bernard-api/src/lib/conversationKeeper.ts` | If exists, defunct implementation |
| `services/bernard-api/src/types/conversations.ts` | If exists, unused types |
| `services/bernard/lib/conversation/conversationRecorder.ts` | Never fully implemented |
| `services/bernard/tests/conversationRecorder.test.ts` | Test file for defunct implementation |
| `services/bernard-ui/src/types/conversation.ts` | Unused conversation types |
| `services/bernard-ui/src/utils/conversationId.ts` | Replaced by threadId.ts |
| `services/bernard-ui/src/pages/user/Conversations.tsx` | Never created, deprecated |
| `services/bernard-ui/src/pages/user/ConversationDetail.tsx` | Never created, deprecated |
| `services/bernard-ui/src/components/conversation/ConversationListTable.tsx` | Never created, deprecated |
| `docs/plans/conversation-history.plan.md` | Archived, superseded |
| `docs/plans/conversation-history-ui.plan.md` | Archived, superseded |

### Configuration Changes

| File | Change |
|------|--------|
| `services/bernard/package.json` | Add `@langchain/langgraph-checkpoint-redis` dependency |

---

## Rollback Plan

If issues arise during implementation, rollback steps:

1. **Revert MemorySaver** in `services/bernard/server.ts`:
   ```typescript
   import { MemorySaver } from "@langchain/langgraph";
   const checkpointer = new MemorySaver();
   ```

2. **Restore conversation files** from git:
   ```bash
   git restore docs/plans/conversation-history.plan.md
   git restore services/bernard-ui/src/utils/conversationId.ts
   ```

3. **Note**: Existing conversation Redis keys won't be migrated, but conversationId tracking in traces will still work.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Redis unavailable on startup | High - service fails to start | Add retry logic with exponential backoff; consider fallback to MemorySaver in dev |
| Thread ID collision | Low - UUID v4 provides sufficient uniqueness | None needed |
| Large thread state in Redis | Medium - memory usage | Implement checkpoint cleanup policy (TTL) |
| Breaking existing UI | Medium - chatId parameter change | Update UI in same PR, no partial deploys |
| Checkpointer initialization failure | High - service crash | Add health check, fail fast with clear error |

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Redis Checkpointer | 2-3 hours |
| Phase 2: Thread ID Utilities | 1 hour |
| Phase 3: Remove Old System | 1-2 hours |
| Phase 4: Server Updates | 1 hour |
| Phase 5: UI Updates | 2-3 hours |
| Phase 6: Testing | 2-3 hours |

**Total Estimated**: 9-14 hours

---

## Dependencies

### New npm Dependencies

```json
{
  "@langchain/langgraph-checkpoint-redis": "^0.0.1"
}
```

### Existing Dependencies Used

- `ioredis` - Already used for Redis connection
- `@langchain/langgraph` - Already in dependency tree
- `crypto.randomUUID()` - Browser native API

---

## API Changes Summary

### Request Format

**Before**:
```json
{
  "model": "bernard-v1",
  "messages": [...],
  "conversationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**After**:
```json
{
  "model": "bernard-v1",
  "messages": [...],
  "chatId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Removed Endpoints

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/conversations` | GET | Removed |
| `/api/conversations/:id` | GET | Removed |
| `/api/conversations/:id/archive` | POST | Removed |
| `/api/conversations/:id` | DELETE | Removed |
| `/api/conversations/all` | GET | Removed |

### New Response Headers (Optional)

```
X-Thread-Id: 550e8400-e29b-41d4-a716-446655440000
```

Include thread ID in response for client-side tracking.

---

## Approval

**Status**: Ready for implementation

**Last Updated**: 2026-01-03

**Author**: AI Planning Assistant
