# Auto-Rename Thread Feature Implementation Plan

## Overview

Add automatic thread naming functionality using LLM-generated titles. Feature includes:

1. **Backend API endpoint** in bernard-api to generate thread titles using LangChain
2. **Auto-rename trigger** after first message is sent in a new thread
3. **Manual auto-rename** option in thread context menu (sidebar)

## Architecture

```
┌─────────────────┐
│   bernard-ui    │
│                 │
│  1. Auto-rename │─────────────┐
│     after       │              │
│  first message  │              │
│                 │              │
│  2. Menu item:  │              │
│  "Auto-Rename"  │              │
└────────┬────────┘              │
         │ POST /threads/:id/auto-rename
         │ { firstMessage: string }
         ▼
┌─────────────────────────────────────┐
│        bernard-api                │
│                                   │
│  - resolveModel("utility")         │
│  - initChatModel()                │
│  - Generate title (3-5 words)     │
│  - Update via LangGraph Client     │
└────────┬──────────────────────────┘
         │ Update thread metadata
         ▼
┌─────────────────────────────────────┐
│        LangGraph                   │
│  Thread metadata updated           │
│  bernard:thread:{id} in Redis     │
└─────────────────────────────────────┘
```

## Key Design Decisions

### Option B: Direct LLM Call in bernard-api
- **Approach**: bernard-api calls LangChain directly to generate titles
- **Rationale**: Simpler implementation, direct control
- **Trade-off**: Adds LangChain dependency to bernard-api (acceptable given future merge plans)

### Model Usage
- **Model Category**: "utility" (fast, cheap model for simple tasks)
- **Temperature**: 0.3 (consistent, deterministic output)
- **Max Tokens**: 30 (short titles only)

### Title Generation Rules
- **Length**: 3-5 words
- **No punctuation**: Remove quotes, trailing periods
- **Max length**: 50 characters (truncate with "..." if needed)
- **Example**: "Weather forecast for Tokyo"

### Auto-Rename Timing
- **Automatic trigger**: After first AI response (messages.length === 2)
- **Manual trigger**: Via "Auto-Rename" menu item anytime

### Metadata Storage
- **Location**: Redis key `bernard:thread:{threadId}`
- **Format**: `{ name: string, namedAt: ISO8601, updatedAt: ISO8601 }`
- **Update method**: LangGraph SDK Client `threads.update()`

---

## Phase 1: Bernard-API Backend

### Task 1.1: Add Dependencies

**File**: `services/bernard-api/package.json`

Add to `dependencies`:
```json
{
  "dependencies": {
    "@langchain/langgraph-sdk": "~1.3.1",
    "langchain": "^1.2.3",
    "ioredis": "^5.8.2"
  }
}
```

Run:
```bash
cd services/bernard-api
npm install
```

### Task 1.2: Create Model Resolution Utility

**File**: `services/bernard-api/src/lib/resolveModel.ts` (NEW)

Purpose: Resolve model configuration from Redis settings.

```typescript
import { getRedis } from "./redis";

interface ModelCategorySettings {
  primary: string;
  providerId: string;
  options?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
}

interface ModelsSettings {
  providers: Array<{
    id: string;
    name: string;
    type: string;
    baseUrl: string;
    apiKey: string;
  }>;
  utility?: ModelCategorySettings;
}

export async function resolveModel(category: "utility"): Promise<{
  id: string;
  options: any;
}> {
  const redis = getRedis();
  await redis.connect();

  const settingsJson = await redis.get("bernard:settings:models");
  if (!settingsJson) {
    await redis.quit();
    throw new Error("Model settings not found");
  }

  const settings: ModelsSettings = JSON.parse(settingsJson);
  const modelSettings = settings[category];

  if (!modelSettings) {
    await redis.quit();
    throw new Error(`No model configured for category: ${category}`);
  }

  const provider = settings.providers.find(p => p.id === modelSettings.providerId);
  if (!provider) {
    await redis.quit();
    throw new Error(`Provider not found: ${modelSettings.providerId}`);
  }

  await redis.quit();

  const modelId = modelSettings.primary;
  const options = {
    ...modelSettings.options,
    ...(provider.type === "openai" ? {
      apiKey: provider.apiKey,
      configuration: {
        baseURL: provider.baseUrl,
      }
    } : {
      // ollama provider options if needed
    })
  };

  return { id: modelId, options };
}
```

### Task 1.3: Add Auto-Rename Endpoint

**File**: `services/bernard-api/src/routes/threads.ts`

Add imports:
```typescript
import { initChatModel } from "langchain/chat_models/universal";
import { Client } from "@langchain/langgraph-sdk";
import { resolveModel } from "../lib/resolveModel";
```

Add endpoint (after existing endpoints, before closing brace):
```typescript
fastify.post<{
  Params: { threadId: string };
  Body: { firstMessage: string };
}>("/threads/:threadId/auto-rename", async (
  request: FastifyRequest<{ Params: { threadId: string }; Body: { firstMessage: string } }>,
  reply: FastifyReply
) => {
  try {
    const { threadId } = request.params;
    const { firstMessage } = request.body;

    if (!firstMessage) {
      return reply.status(400).send({ error: "firstMessage is required" });
    }

    fastify.log.info({ threadId }, "Starting auto-rename");

    // Resolve utility model
    const { id: modelId, options } = await resolveModel("utility");
    const namingModel = await initChatModel(modelId, options);

    // Generate title
    const min = 3;
    const max = 5;
    const prompt = "";

    const fullPrompt = "Generate a concise title for this conversation.\n\n" +
      prompt + (prompt ? "\n\n" : "") +
      `Your title must be between ${min} and ${max} words.\n\n` +
      `The conversation so far is: ${firstMessage}`;

    const response = await namingModel.invoke([
      { role: "user", content: fullPrompt }
    ]);

    // Clean response
    const title = typeof response.content === "string"
      ? response.content.trim().replace(/"/g, "")
      : "New Chat";

    // Truncate if too long
    let finalTitle = title;
    if (finalTitle.length > 50) {
      finalTitle = finalTitle.substring(0, 47) + "...";
    }

    fastify.log.info({ threadId, title: finalTitle }, "Generated title");

    // Update thread via LangGraph Client
    const client = new Client({
      apiUrl: process.env['LANGGRAPH_API_URL'] ?? "http://localhost:2024",
    });

    await client.threads.update(threadId, {
      metadata: {
        name: finalTitle,
        created_at: new Date().toISOString()
      },
    });

    fastify.log.info({ threadId, name: finalTitle }, "Thread renamed successfully");

    return reply.send({
      success: true,
      threadId,
      name: finalTitle,
    });
  } catch (error) {
    fastify.log.error({ error, threadId: request.params.threadId }, "Failed to auto-rename thread");
    return reply.status(500).send({
      error: "Failed to auto-rename thread",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
```

### Task 1.4: Verify Implementation

**Testing**:
1. Start bernard-api: `./scripts/bernard-api.sh start`
2. Test endpoint with curl:
```bash
curl -X POST http://localhost:8800/api/threads/test-id/auto-rename \
  -H "Content-Type: application/json" \
  -d '{"firstMessage": "What is the weather in Tokyo today?"}'
```

3. Verify logs show title generation
4. Check Redis for updated thread metadata

---

## Phase 2: Bernard-UI API Client

### Task 2.1: Add API Client Method

**File**: `services/bernard-ui/src/services/api.ts`

Add method to APIClient class (after `deleteThread`):

```typescript
async autoRenameThread(threadId: string, firstMessage: string): Promise<{
  success: boolean;
  threadId: string;
  name: string;
}> {
  const response = await fetch(`/threads/${threadId}/auto-rename`, {
    credentials: 'same-origin',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders()
    },
    body: JSON.stringify({ firstMessage })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to auto-rename thread');
  }

  return response.json();
}
```

### Task 2.2: Export API Client Instance

Ensure `apiClient` is exported at bottom of file:
```typescript
export const apiClient = new APIClient('', '/api', '/api');
```

---

## Phase 3: Bernard-UI Auto-Rename After First Message

### Task 3.1: Add State to Thread Component

**File**: `services/bernard-ui/src/components/chat/Thread.tsx`

Add import:
```typescript
import { useThreads } from '../../providers/ThreadProvider';
```

Add state after existing state declarations:
```typescript
const [hasTriggeredAutoRename, setHasTriggeredAutoRename] = useState(false);
const { getThreads } = useThreads();
```

### Task 3.2: Add Auto-Rename Effect

Add effect after existing useEffect hooks:
```typescript
// Auto-rename thread after first message exchange
useEffect(() => {
  // Only rename if:
  // - We have a threadId
  // - We haven't triggered rename yet
  // - We have at least 2 messages (human + AI response)
  if (
    threadId &&
    !hasTriggeredAutoRename &&
    messages.length === 2
  ) {
    const firstHumanMessage = messages.find(m => m.type === 'human');

    if (firstHumanMessage) {
      const messageContent = typeof firstHumanMessage.content === 'string'
        ? firstHumanMessage.content
        : JSON.stringify(firstHumanMessage.content);

      // Trigger auto-rename (fire and forget)
      apiClient.autoRenameThread(threadId, messageContent)
        .then(() => {
          // Refresh thread list to show updated name
          getThreads();
        })
        .catch(err => {
          // Silent fail - don't interrupt user experience
          console.error('Auto-rename failed:', err);
        });

      setHasTriggeredAutoRename(true);
    }
  }
}, [messages, hasTriggeredAutoRename, threadId, getThreads]);
```

### Task 3.3: Add getThreads to ThreadProvider (if not present)

**File**: `services/bernard-ui/src/providers/ThreadProvider.tsx`

Ensure `getThreads` is exported in the return value:
```typescript
return (
  <ThreadContext.Provider value={{
    threads,
    setThreads,
    activeThreadId,
    setActiveThreadId,
    createNewThread,
    updateThread,
    deleteThread,
    getThreads,  // Add this if not present
    refreshThreads,
  }}>
    {children}
  </ThreadContext.Provider>
);
```

### Task 3.4: Update ThreadContext Type

Ensure ThreadContext type includes getThreads:
```typescript
interface ThreadContextType {
  threads: ThreadListItem[];
  setThreads: Dispatch<SetStateAction<ThreadListItem[]>>;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  createNewThread: () => Promise<string>;
  updateThread: (threadId: string, name: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  getThreads: () => Promise<void>;  // Add this
  refreshThreads: () => Promise<void>;
}
```

---

## Phase 4: Bernard-UI Manual Auto-Rename (Menu Item)

### Task 4.1: Add Imports to ConversationHistory

**File**: `services/bernard-ui/src/components/chat/ConversationHistory.tsx`

Add import:
```typescript
import { Wand2 } from 'lucide-react';
import { Client } from '@langchain/langgraph-sdk';
import { useStreamContext } from '../../providers/StreamProvider';
```

### Task 4.2: Add State to ThreadItem

Add state after existing state declarations in ThreadItem component:
```typescript
const [isAutoRenaming, setIsAutoRenaming] = useState(false);
```

### Task 4.3: Add Auto-Rename Handler

Add handler after handleDelete in ThreadItem component:
```typescript
const handleAutoRename = async () => {
  if (!thread.id) return;

  setIsAutoRenaming(true);
  try {
    // Fetch thread messages from LangGraph
    const client = new Client({
      apiUrl: '/api', // Forward via proxy-api
    });

    const state = await client.threads.getState(thread.id);
    const messages = state?.values?.messages || [];

    // Get first human message
    const firstHumanMessage = messages.find((m: any) => m.type === 'human');
    const messageContent = firstHumanMessage
      ? (typeof firstHumanMessage.content === 'string'
          ? firstHumanMessage.content
          : JSON.stringify(firstHumanMessage.content))
      : "";

    await apiClient.autoRenameThread(thread.id, messageContent);
    await getThreads();
    toast.success('Thread renamed successfully');
  } catch (error) {
    console.error('Auto-rename failed:', error);
    toast.error('Failed to rename thread');
  } finally {
    setIsAutoRenaming(false);
  }
};
```

### Task 4.4: Add Menu Item

Add menu item to DropdownMenuContent (between Rename and Delete):
```typescript
<DropdownMenuItem
  onClick={(e) => {
    e.stopPropagation();
    setIsRenaming(true);
  }}
>
  <Pencil className="mr-2 h-4 w-4" />
  Rename
</DropdownMenuItem>
<DropdownMenuItem
  onClick={(e) => {
    e.stopPropagation();
    handleAutoRename();
  }}
  disabled={isAutoRenaming}
>
  <Wand2 className="mr-2 h-4 w-4" />
  Auto-Rename
</DropdownMenuItem>
<DropdownMenuItem
  onClick={(e) => {
    e.stopPropagation();
    setIsDeleting(true);
  }}
  className="text-destructive focus:text-destructive"
>
  <Trash2 className="mr-2 h-4 w-4" />
  Delete
</DropdownMenuItem>
```

---

## Phase 5: Integration Testing

### Task 5.1: Test Automatic Auto-Rename

1. Start all services: `./scripts/services.sh start`
2. Open bernard-ui at http://localhost:3456
3. Create new thread
4. Send first message: "What is the capital of France?"
5. Wait for AI response
6. Verify:
   - Thread name in sidebar updates to auto-generated title
   - Title is 3-5 words
   - No quotes or punctuation
   - Check bernard-api logs for successful rename

### Task 5.2: Test Manual Auto-Rename

1. Click on any existing thread
2. Click "..." menu on thread in sidebar
3. Click "Auto-Rename"
4. Verify:
   - Loading state on menu item
   - Toast success message
   - Thread name updates
   - Error handling if rename fails

### Task 5.3: Test Edge Cases

1. **Empty thread**: Try auto-renaming with no messages
2. **Long message**: Test with very long first message
3. **Special characters**: Test with emojis, code blocks
4. **API errors**: Test with invalid thread ID
5. **Network errors**: Test with bernard-api down
6. **No utility model**: Test without configured utility model

### Task 5.4: Verify Metadata Storage

Check Redis directly:
```bash
redis-cli
> get bernard:thread:{threadId}
```

Verify output includes:
```json
{
  "name": "Generated Title",
  "namedAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

## Phase 6: Code Quality & Documentation

### Task 6.1: Type Checking

Run TypeScript checks:
```bash
cd services/bernard-api
npm run type-check

cd services/bernard-ui
npm run type-check
```

### Task 6.2: Linting

Run linters:
```bash
cd services/bernard-api
npm run lint

cd services/bernard-ui
npm run lint
```

### Task 6.3: Update Documentation

Update relevant docs:
- AGENTS.md - Note new auto-rename functionality
- README.md (if applicable)

---

## Rollback Plan

If issues arise:

1. **Bernard-API**: Remove new endpoint from threads.ts
2. **Bernard-UI**: Remove auto-rename effect and menu item
3. **Restore**: `git checkout` modified files

Key rollback points:
- After Task 1.3 (backend endpoint)
- After Task 3.2 (UI auto-rename)
- After Task 4.4 (menu item)

---

## Success Criteria

✅ Thread automatically renamed after first message
✅ Manual "Auto-Rename" option in sidebar menu works
✅ Generated titles are 3-5 words, no punctuation
✅ Titles update in UI immediately after rename
✅ Error handling gracefully fails (no broken UI)
✅ TypeScript compilation passes
✅ Linting passes
✅ No performance degradation
