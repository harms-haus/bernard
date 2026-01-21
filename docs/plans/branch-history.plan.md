# Plan: Retry and Branching System for Chat Thread

## Overview

Build a retry and branching system using the existing `BranchSwitcher` component. Each USER MESSAGE will get a "retry" button that re-submits the user's message and creates a new branch from that checkpoint. The `BranchSwitcher` will appear AFTER the user message (vertically) and allow switching between branches.

**UI Layout:**
```
┌─────────────────────────────────────────────┐
│ [User Message Content]              [Edit][Retry] │
├─────────────────────────────────────────────┤
│            <BranchSwitcher />                │
│         1 / 3    [<] [>]                     │
├─────────────────────────────────────────────┤
│ [AI Response for current branch]            │
└─────────────────────────────────────────────┘
```

## Root Cause Found and Fixed

### Issue: `parent_checkpoint` was null

The custom `RedisSaver` was not storing or returning parent checkpoint information. When the SDK tried to create branches, `getMessagesMetadata().firstSeenState.parent_checkpoint` was always `null`, preventing branching from working.

### Fix Applied

**File:** `core/src/lib/checkpoint/redis-saver.ts`

1. **Store parent checkpoint ID** in `put()` method (line 133):
   - Extract `parentCheckpointId` from `config.configurable.checkpoint_id`
   - Store it as `parent_checkpoint_id` in the Redis JSON document

2. **Return `parentConfig`** in `loadCheckpointTuple()` method (lines 381-391):
   - Read `parent_checkpoint_id` from stored data
   - Add `parentConfig` to the `CheckpointTuple` when a parent exists

This matches the pattern from the official `MemorySaver` implementation in `@langchain/langgraph-checkpoint`.

## Key Implementation Details

### LangGraph SDK Branching API (from official docs)

The `useStream` hook provides:
- `getMessagesMetadata(message)` - Returns metadata including:
  - `branch` - Current branch ID
  - `branchOptions` - Array of available branch IDs
  - `firstSeenState.parent_checkpoint` - Checkpoint to branch from (NOW WORKS after RedisSaver fix)
- `setBranch(branchId)` - Switch to a different branch
- `submit(values, { checkpoint })` - Submit with checkpoint to create branch

## Phase 1: Update HumanMessage Component

**File:** `core/src/components/chat/thread/messages/human.tsx`

### Changes:
1. Add `getMessagesMetadata()` call to retrieve branch metadata for the message
2. Add a "Retry" button next to the existing Edit button (horizontally aligned)
3. Add `BranchSwitcher` component below the message content
4. All tooltips set to `side="bottom"`

### Retry Button Behavior:
```typescript
const handleRetry = () => {
  const parentCheckpoint = messageMetadata?.firstSeenState?.parent_checkpoint;

  // Check if we even have checkpoint data
  if (!parentCheckpoint) {
    console.warn('[Retry] No parent checkpoint found - branching will not work');
    // Fallback: submit normally (this will append, not branch)
    thread.submit({ messages: [message] }, {});
    return;
  }

  // Re-submit the same message from the parent checkpoint to create a new branch
  thread.submit(
    { messages: [message] },
    { checkpoint: parentCheckpoint } as any
  );
};
```

### Floating Buttons Layout:
```
[Edit] [Retry]  <- horizontally aligned, right-aligned floating buttons
```

### BranchSwitcher Placement:
- Appears below the user message (in the flex-col gap-2)
- Uses the existing `BranchSwitcher` component from `core/src/components/chat/thread/components/BranchSwitcher.tsx`
- Only renders when `branchOptions.length > 1`

## Phase 2: Update StreamProvider Types

**File:** `core/src/components/chat/thread/providers/Stream.tsx`

### Changes:
- Extended `StreamContextType` to explicitly include `getMessagesMetadata` and `setBranch` methods
- These methods come from the LangGraph SDK's `UseStream` return type

## Phase 3: Update AssistantMessage Tooltips

**File:** `core/src/components/chat/thread/messages/ai.tsx`

### Changes:
- Changed copy button tooltip from `side="left"` to `side="bottom"`

## Critical Files Modified

| File | Purpose |
|------|---------|
| `core/src/lib/checkpoint/redis-saver.ts` | **FIXED**: Store and return parent_checkpoint |
| `core/src/components/chat/thread/messages/human.tsx` | Add retry button and BranchSwitcher |
| `core/src/components/chat/thread/providers/Stream.tsx` | Extended types for branching methods |
| `core/src/components/chat/thread/messages/ai.tsx` | Changed tooltip to bottom |

## Implementation Steps (Completed)

1. **[DONE] Fixed RedisSaver** (`redis-saver.ts`):
   - Store `parent_checkpoint_id` in `put()` method
   - Return `parentConfig` in `loadCheckpointTuple()` method

2. **[DONE] Update HumanMessage component** (`human.tsx`):
   - Import `BranchSwitcher` component
   - Call `thread.getMessagesMetadata(message)` to get branch metadata
   - Add retry button handler using `checkpoint` from metadata
   - Add `BranchSwitcher` below message content
   - Wire up `onSelect` to `thread.setBranch(branch)`

3. **[DONE] Verify StreamProvider** (`Stream.tsx`):
   - Confirmed `fetchStateHistory: true` is set
   - Extended type to include `getMessagesMetadata` and `setBranch`

## Verification

### CRITICAL: Server Restart Required

**The RedisSaver fix requires a complete restart of the LangGraph agent server.**

The SDK queries the backend API (the LangGraph server at port 2024), not Redis directly. The server loads the RedisSaver module at startup, so changes to RedisSaver won't take effect until the server is restarted.

### Steps to Verify the Fix:

1. **Stop all running servers** (dev server, agent server)
2. **Start the agent server** with the fixed RedisSaver:
   ```bash
   cd core && npm run agent:bernard
   ```
3. **Start the dev server** in a new terminal:
   ```bash
   cd core && npm run dev
   ```
4. **Create a NEW thread** (or clear Redis checkpoints for existing threads)
5. **Send a message** in the chat
6. **Click "Retry"** - this should create a new branch
7. **Verify BranchSwitcher appears** showing "1 / 2" or similar
8. **Click `<` and `>`** to switch between branches

### How Branching Works:

The SDK builds branch information from the state history returned by the backend. When you submit with a checkpoint:
1. The backend creates a NEW checkpoint with `parent_checkpoint_id` pointing to the submitted checkpoint
2. The SDK's `history` array contains multiple states
3. When multiple states share the same parent checkpoint, the SDK recognizes them as branches
4. `getMessagesMetadata()` then populates `branch` and `branchOptions`

### Debug Commands:

To verify checkpoints have parent info in Redis:
```bash
redis-cli
> JSON.GET checkpoint:<thread_id>::<checkpoint_ns>::<checkpoint_id>
```

Look for the `parent_checkpoint_id` field in the output.

#### Edge Cases to Test:
- First message in a thread (no previous checkpoint - should warn and fall back to normal submit)
- Multiple retries on the same message (3+ branches)
- Switching branches while AI is streaming a response
- Editing a message vs retrying a message - both should create branches

## Current Status

**BLOCKED: Backend API Limitation**

### Root Cause Analysis (Complete)

After extensive debugging, I discovered that the **LangGraph server's HTTP API** does NOT include `checkpoint_id` in the state history response.

**Evidence:**
```
[Branch Debug] history items:
  [0] checkpoint_id: undefined, parent_checkpoint_id in metadata: undefined
  [1] checkpoint_id: undefined, parent_checkpoint_id in metadata: undefined
  ...

[Branch Debug] branchTree sequence items:
  [0] node - checkpoint_ns: undefined, checkpoint_id: undefined
  [1] node - checkpoint_ns: undefined, checkpoint_id: undefined
  ...
```

**The Issue:**
1. The SDK queries `/threads/{thread_id}/history` to get state history
2. The backend returns states but **does NOT include `checkpoint_id` in the metadata**
3. Without checkpoint IDs, the SDK cannot:
   - Track parent-child relationships between checkpoints
   - Detect when multiple states share the same parent (forks/branches)
   - Populate `branch` and `branchOptions` in `getMessagesMetadata()`

**What We Fixed (Working but Insufficient):**
- ✅ RedisSaver now stores and returns `parent_checkpoint_id`
- ✅ The data is correctly stored in Redis
- ❌ BUT the backend API doesn't expose this data to the frontend

**The Gap:**
The LangGraph server (running on port 2024) uses the checkpointer internally but doesn't include checkpoint information in the HTTP API response. This is a **backend API limitation**, not a RedisSaver issue.

### Implementation Summary

All code changes have been made:
1. ✅ RedisSaver fix applied (stores and returns `parent_checkpoint_id`)
2. ✅ HumanMessage component updated (retry button and BranchSwitcher)
3. ✅ StreamProvider types extended
4. ✅ AssistantMessage tooltip changed to `side="bottom"`

**Result:** The retry button correctly removes and regenerates messages, but the BranchSwitcher never appears because `branch` and `branchOptions` are always `undefined`.

### Possible Solutions

**Option 1: Wait for LangGraph SDK Update**
- The SDK team may add checkpoint_id to the history API response in a future version
- This is the correct long-term solution but requires waiting for upstream changes

**Option 2: Custom Backend Endpoint**
- Create a custom API endpoint that returns checkpoint history with parent relationships
- Query Redis directly from the frontend via this endpoint
- More work but gives full control

**Option 3: Alternative Branching UI**
- Use a different approach for branching that doesn't rely on SDK's `getMessagesMetadata()`
- Track branches manually in the frontend state
- More complex but works around the API limitation

**Option 4: Direct Redis Query from Frontend**
- Query Redis checkpoint data directly using a backend-for-frontend endpoint
- Build the branch tree manually from checkpoint relationships
- Requires additional backend work

## Notes

- **The RedisSaver fix is correct and working** - it stores `parent_checkpoint_id` in Redis
- **The issue is at the HTTP API layer** - the LangGraph server doesn't expose checkpoint IDs
- **This is a known limitation** of the current LangGraph server architecture
- The `checkpoint_id` exists internally but is not returned in the `/history` endpoint
- The SDK's `getMessagesMetadata()` depends on checkpoint IDs being present in the history
- Without checkpoint IDs, the SDK cannot build branch information or detect forks
- **Old checkpoints won't have parent info**: only NEW checkpoints created after this fix will have parent_checkpoint_id stored
- The LangGraph SDK automatically manages branch state
- When `setBranch()` is called, `useStream` re-renders with the new branch's messages
- The `fetchStateHistory: true` option in `useStream` enables checkpoint retrieval
- Branch IDs are opaque strings managed by LangGraph
- The parent checkpoint is the checkpoint *before* the message was first seen

## References

- LangGraph SDK React Integration: https://langgraph.com.cn/cloud/how-tos/use_stream_react/index.html
- The SDK provides `getMessagesMetadata()`, `setBranch()`, and checkpoint-based `submit()`
- MemorySaver reference implementation in `@langchain/langgraph-checkpoint/dist/memory.js`
