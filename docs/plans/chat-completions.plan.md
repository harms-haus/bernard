# Plan: OpenAI-Compatible `/api/v1/chat/completions` Endpoint

**Status**: Functional but not OpenAI-spec compliant; requires targeted fixes
**Last Updated**: 2026-01-23
**Related Files**:
- `/core/backend/routes/v1.ts` (current implementation)
- `/core/backend/utils/auth.ts` (auth utilities)

---

## Executive Summary

### Current State: ⚠️ **PARTIAL COMPLIANCE**

The `/api/v1/chat/completions` endpoint is implemented and functional. It handles:

- ✅ **Authentication**: Uses Better-Auth sessions via `getSession()`
- ✅ **Dual mode**: Supports both streaming and non-streaming requests
- ✅ **SDK integration**: Direct use of LangGraph SDK (not simple proxying)
- ✅ **User context**: Injects `userRole` for tool filtering
- ✅ **Thread management**: Auto-creates threads when `thread_id` not provided
- ✅ **SSE streaming**: Proper Server-Sent Events format

### Critical Gaps for OpenAI Compliance ❌

- ❌ **Non-streaming response format**: Returns raw LangGraph run object instead of OpenAI `chat.completion` format
- ❌ **Missing OpenAI parameters**: Only supports `messages`, `model`, `thread_id`, `stream` - missing `temperature`, `max_tokens`, `top_p`, etc.
- ❌ **No input validation**: Basic checks only; doesn't validate parameter ranges or types
- ❌ **Error format not OpenAI-compatible**: Returns `{ error, message }` instead of `{ error: { message, type, param } }`

### Recommendation: **Targeted compliance, not side-projects**

The existing implementation uses the correct pattern (direct SDK use). Enhance only what's needed for OpenAI spec compliance. Remove all optional features that aren't required for spec.

---

## Critical Issues

### Issue 1: Non-Streaming Response Wrong Format

**Current Code** (`/core/backend/routes/v1.ts` lines 58-61):
```typescript
if (!stream) {
  const run = await client.runs.create(threadId, assistantId, {
    input: { messages, userRole }
  })
  const result = await client.runs.join(threadId, run.run_id)
  return c.json(result)  // ❌ Returns raw LangGraph run object
}
```

**Problem**: LangGraph `runs.join()` returns a complex run object, not OpenAI `chat.completion` format. Clients expecting OpenAI SDK will fail.

**Required Output**:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1738000000,
  "model": "bernard_agent",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Response text...",
      "tool_calls": [...],
      "refusal": null
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default"
}
```

---

### Issue 2: Missing OpenAI Parameters

**Current Support**: Only `messages`, `model`, `thread_id`, `stream`

**OpenAI Spec Requires**:
| Parameter | Type | OpenAI | LangGraph Support | Status |
|-----------|------|----------|------------------|--------|
| `messages` | array | ✅ Required | ✅ | Supported |
| `model` | string | ✅ Required | ✅ | Supported |
| `stream` | boolean | ✅ Optional | ✅ | Supported |
| `temperature` | number (0-2) | ✅ Optional | ✅ | **Must add** |
| `max_completion_tokens` | integer | ✅ Optional | ✅ | **Must add** |
| `max_tokens` | integer (deprecated) | ✅ Optional | ✅ | **Must add** |
| `top_p` | number (0-1) | ✅ Optional | ✅ | **Must add** |
| `presence_penalty` | number (-2 to 2) | ✅ Optional | ❌ | Reject with 400 |
| `frequency_penalty` | number (-2 to 2) | ✅ Optional | ❌ | Reject with 400 |
| `stop` | string/array | ✅ Optional | ❌ | Reject with 400 |
| `n` | integer | ✅ Optional | ❌ | Reject with 400 |
| `response_format` | object | ✅ Optional | ❌ | Reject with 400 |
| `tools` | array | ✅ Optional | ✅ | Agent manages this |
| `tool_choice` | string/object | ✅ Optional | ✅ | Agent manages this |

**Parameter Mapping**:
```typescript
// OpenAI params → LangGraph agent input
const agentInput: Record<string, unknown> = {
  messages,
  userRole,
}

if (temperature !== undefined) {
  agentInput.temperature = temperature
}

if (max_completion_tokens !== undefined) {
  agentInput.maxTokens = max_completion_tokens
} else if (max_tokens !== undefined) {
  agentInput.maxTokens = max_tokens
}

if (top_p !== undefined) {
  agentInput.topP = top_p
}

// presence_penalty and frequency_penalty: reject with 400 error
if (presence_penalty !== undefined || frequency_penalty !== undefined) {
  throw createValidationError('presence_penalty and frequency_penalty are not supported')
}
```

---

### Issue 3: No Comprehensive Input Validation

**Current Code** (`/core/backend/routes/v1.ts` lines 35-40):
```typescript
if (!messages || !Array.isArray(messages) || messages.length === 0) {
  return c.json(
    { error: 'messages is required and must be a non-empty array' },
    400
  )
}
```

**Problem**: Only validates `messages`. Doesn't validate:
- Message structure (role, content)
- Parameter types and ranges
- Unsupported parameters

---

### Issue 4: Error Format Not OpenAI-Compatible

**Current Code** (`/core/backend/routes/v1.ts` lines 211-216):
```typescript
} catch (error) {
  reqLogger.error({ error }, 'Chat completions error')
  return c.json(
    { error: 'Internal server error', message: ... },
    500
  )
}
```

**Required Format**:
```json
{
  "error": {
    "message": "Invalid request body",
    "type": "invalid_request_error",
    "param": "messages",
    "code": "invalid_request_error"
  }
}
```

---

## Implementation Plan: OpenAI Spec Compliance

### Priority 1: Transform Non-Streaming Response (CRITICAL)

**File**: `/core/backend/routes/v1.ts`

**Changes**:
1. Extract final assistant message from LangGraph run result
2. Format as OpenAI `chat.completion` object
3. Add all required fields: `id`, `object`, `created`, `model`, `choices`, `usage`, `service_tier`
4. Handle `tool_calls` properly in response

**Implementation**:
```typescript
if (!stream) {
  const run = await client.runs.create(threadId, assistantId, {
    input: { messages, userRole, ...agentInput }
  })
  const result = await client.runs.join(threadId, run.run_id)

  // Transform to OpenAI format
  const completionId = `chatcmpl-${Date.now()}`
  const created = Math.floor(Date.now() / 1000)

  // Extract final assistant message from run result
  const finalMessage = result.messages?.find((m: any) => m.type === 'ai')

  const response = {
    id: completionId,
    object: 'chat.completion',
    created,
    model: assistantId,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: finalMessage?.content ?? '',
        tool_calls: finalMessage?.tool_calls ?? [],
        refusal: null,
      },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: result?.usage?.prompt_tokens ?? 0,
      completion_tokens: result?.usage?.completion_tokens ?? 0,
      total_tokens: result?.usage?.total_tokens ?? 0,
      prompt_tokens_details: {
        cached_tokens: 0,
        audio_tokens: 0,
      },
      completion_tokens_details: {
        reasoning_tokens: 0,
        audio_tokens: 0,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
      },
    },
    service_tier: 'default',
  }

  return c.json(response)
}
```

**Estimated Time**: 2-3 hours
**Dependencies**: None

---

### Priority 2: Add OpenAI Parameter Support (CRITICAL)

**File**: `/core/backend/routes/v1.ts`

**Changes**:
1. Extract `temperature`, `max_tokens`/`max_completion_tokens`, `top_p` from request body
2. Map to LangGraph agent input: `temperature`, `maxTokens`, `topP`
3. Reject unsupported parameters with clear 400 error

**Implementation**:
```typescript
const body = await c.req.json()
const {
  messages,
  model,
  thread_id,
  stream,
  temperature,
  max_tokens,
  max_completion_tokens,
  top_p,
  presence_penalty,
  frequency_penalty,
  stop,
  n,
} = body

// Reject unsupported parameters
if (presence_penalty !== undefined) {
  return c.json({
    error: {
      message: 'presence_penalty parameter is not supported',
      type: 'invalid_request_error',
      param: 'presence_penalty',
    }
  }, 400)
}

if (frequency_penalty !== undefined) {
  return c.json({
    error: {
      message: 'frequency_penalty parameter is not supported',
      type: 'invalid_request_error',
      param: 'frequency_penalty',
    }
  }, 400)
}

if (stop !== undefined) {
  return c.json({
    error: {
      message: 'stop parameter is not supported',
      type: 'invalid_request_error',
      param: 'stop',
    }
  }, 400)
}

if (n !== undefined && n !== 1) {
  return c.json({
    error: {
      message: 'Only n=1 is supported',
      type: 'invalid_request_error',
      param: 'n',
    }
  }, 400)
}

// Map supported parameters to agent input
const agentInput: Record<string, unknown> = {
  messages,
  userRole,
}

if (temperature !== undefined) {
  agentInput.temperature = temperature
}

if (max_completion_tokens !== undefined) {
  agentInput.maxTokens = max_completion_tokens
} else if (max_tokens !== undefined) {
  agentInput.maxTokens = max_tokens
}

if (top_p !== undefined) {
  agentInput.topP = top_p
}

// Use agentInput in run creation
const run = await client.runs.create(threadId, assistantId, {
  input: agentInput
})
```

**Estimated Time**: 2-3 hours
**Dependencies**: None

---

### Priority 3: Add Input Validation (CRITICAL)

**File**: `/core/backend/routes/v1.ts`

**Changes**:
1. Create Zod schema for OpenAI chat completion request
2. Validate request body on entry
3. Return 400 with OpenAI error format on validation failures

**Implementation**:
```typescript
import { z } from 'zod'

const ChatCompletionRequestSchema = z.object({
  // Required fields
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string().min(1),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
  })).min(1),

  // Model
  model: z.string().default('bernard_agent'),

  // Optional fields
  thread_id: z.string().regex(/^[a-zA-Z0-9-_]+$/).optional(),
  stream: z.boolean().default(false),

  // Supported OpenAI parameters
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),

  // Unsupported parameters (for validation only)
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  n: z.number().int().min(1).max(128).optional(),
})

// Usage in route
v1Routes.post('/chat/completions', async (c) => {
  try {
    const body = await c.req.json()
    const validated = ChatCompletionRequestSchema.parse(body)

    // Extract validated values
    const {
      messages,
      model,
      thread_id,
      stream,
      temperature,
      max_tokens,
      max_completion_tokens,
      top_p,
      presence_penalty,
      frequency_penalty,
      stop,
      n,
    } = validated

    // Reject unsupported parameters
    if (presence_penalty !== undefined) {
      return c.json({
        error: {
          message: 'presence_penalty parameter is not supported',
          type: 'invalid_request_error',
          param: 'presence_penalty',
        }
      }, 400)
    }

    if (frequency_penalty !== undefined) {
      return c.json({
        error: {
          message: 'frequency_penalty parameter is not supported',
          type: 'invalid_request_error',
          param: 'frequency_penalty',
        }
      }, 400)
    }

    if (stop !== undefined) {
      return c.json({
        error: {
          message: 'stop parameter is not supported',
          type: 'invalid_request_error',
          param: 'stop',
        }
      }, 400)
    }

    if (n !== undefined && n !== 1) {
      return c.json({
        error: {
          message: 'Only n=1 is supported',
          type: 'invalid_request_error',
          param: 'n',
        }
      }, 400)
    }

    // Proceed with validated data...
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: {
          message: 'Invalid request body',
          type: 'invalid_request_error',
          details: error.errors,
        }
      }, 400)
    }
    throw error
  }
})
```

**Estimated Time**: 2 hours
**Dependencies**: Zod already installed

---

### Priority 4: OpenAI-Compatible Error Responses (CRITICAL)

**Files**:
- `/core/backend/utils/errors.ts` (new)
- `/core/backend/routes/v1.ts`

**Changes**:
1. Create error helper functions matching OpenAI format
2. Update all error paths in route to use new format

**Implementation**:
```typescript
// backend/utils/errors.ts
export function createOpenAIError(
  statusCode: number,
  message: string,
  type: string,
  param?: string,
  details?: Record<string, unknown>
) {
  return {
    error: {
      message,
      type,
      ...(param && { param }),
      ...(details && { details }),
    }
  }
}

export const ERROR_CODES = {
  INVALID_REQUEST: 'invalid_request_error',
  INTERNAL_ERROR: 'internal_error',
} as const

// Usage in route
} catch (error) {
  reqLogger.error({ error }, 'Chat completions error')

  if (error instanceof z.ZodError) {
    return c.json(
      createOpenAIError(
        400,
        'Invalid request body',
        ERROR_CODES.INVALID_REQUEST,
        undefined,
        { validation_errors: error.errors }
      ),
      400
    )
  }

  return c.json(
    createOpenAIError(
      500,
      'Internal server error',
      ERROR_CODES.INTERNAL_ERROR
    ),
    500
  )
}
```

**Estimated Time**: 1-2 hours
**Dependencies**: None

---

## Implementation Summary

### Tasks (In Order)

| Priority | Task | Time | Dependencies |
|----------|------|------|--------------|
| 1 | Transform non-streaming response | 2-3 hours | None |
| 2 | Add OpenAI parameter support | 2-3 hours | None |
| 3 | Add input validation | 2 hours | None |
| 4 | OpenAI-compatible error responses | 1-2 hours | None |

**Total Estimated Effort**: 7-10 hours

---

## What Was Removed (Side-Projects)

The following items from the original plan are **NOT required for OpenAI spec compliance** and should be removed:

| Original Priority | Item | Why It's a Side-Project |
|-----------------|------|----------------------|
| Priority 2 | Auth Middleware Wrappers | Nice refactor for DRY, but current `getSession()` works fine. Not required for spec. |
| Priority 4 | Thread Ownership Verification | Security feature, but not part of OpenAI spec. Agent doesn't enforce this anyway. |
| Priority 5 | Enhanced Logging | Current logging is adequate. Richer logging is nice-to-have, not required. |
| Phase 3 (Task 3.1) | Usage Tracking | Not part of OpenAI `/v1/chat/completions` spec. |
| Phase 3 (Task 3.2) | Rate Limiting | Nice feature, but not required for spec compliance. |

**Rationale**: Focus only on what the OpenAI Chat Completions API specification requires. Everything else is scope creep.

---

## Testing Strategy

### Unit Tests

```typescript
// test/routes/v1.test.ts
import { describe, it, expect } from 'vitest'
import { TestClient } from '../utils/test-client'

describe('POST /api/v1/chat/completions', () => {
  it('should validate required messages', async () => {
    const response = await client.post('/api/v1/chat/completions', {
      model: 'bernard_agent',
      messages: []
    })
    expect(response.status).toBe(400)
    expect(response.body.error.type).toBe('invalid_request_error')
  })

  it('should reject unsupported parameters', async () => {
    const response = await client.post('/api/v1/chat/completions', {
      model: 'bernard_agent',
      messages: [{ role: 'user', content: 'Hello' }],
      presence_penalty: 0.5
    })
    expect(response.status).toBe(400)
    expect(response.body.error.message).toContain('not supported')
  })

  it('should accept supported parameters', async () => {
    const response = await client.post('/api/v1/chat/completions', {
      model: 'bernard_agent',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      max_completion_tokens: 1000,
      top_p: 0.9
    })
    expect(response.status).toBe(200)
  })

  it('should return OpenAI format for non-streaming', async () => {
    const response = await client.post('/api/v1/chat/completions', {
      model: 'bernard_agent',
      messages: [{ role: 'user', content: 'Hello' }]
    })
    expect(response.body.object).toBe('chat.completion')
    expect(response.body.id).toMatch(/^chatcmpl-/)
    expect(response.body.choices).toBeDefined()
    expect(response.body.usage).toBeDefined()
  })

  it('should stream responses when stream=true', async () => {
    const response = await client.post('/api/v1/chat/completions', {
      model: 'bernard_agent',
      stream: true,
      messages: [{ role: 'user', content: 'Hello' }]
    })
    expect(response.headers['content-type']).toBe('text/event-stream')
  })
})
```

### Integration Tests

```bash
# Test with OpenAI SDK
bunx openai chat --model bernard_agent "Hello"

# Test with temperature
curl -X POST http://localhost:3456/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "bernard_agent",
    "temperature": 0.5,
    "max_completion_tokens": 1000,
    "top_p": 0.9,
    "messages": [{"role": "user", "content": "Tell me a short joke"}]
  }'

# Test error handling for unsupported params
curl -X POST http://localhost:3456/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "bernard_agent",
    "presence_penalty": 0.5,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
# Expected: 400 with error type 'invalid_request_error'
```

---

## Architecture Decision: Keep Current Approach

**Recommendation**: ✅ **Keep direct LangGraph SDK integration**

**Rationale**:
- Existing implementation follows correct pattern
- SDK provides abstractions we need (type safety, thread management, streaming)
- Transformation layer gives us flexibility to format responses
- Type safety prevents runtime errors

**Enhancements are incremental, not a rewrite**:
- Transform response format (doesn't change core logic)
- Add parameter mapping (extends existing input)
- Add validation (doesn't change core logic)
- Improve error responses (better output, same logic)

---

## Summary

### What Works ✅
- ✅ Authentication with Better-Auth
- ✅ Dual mode (streaming/non-streaming)
- ✅ Direct LangGraph SDK integration
- ✅ User role injection for tool filtering
- ✅ OpenAI-compatible SSE streaming format
- ✅ Automatic thread creation

### What to Fix 🔧 (for OpenAI spec compliance)
1. **Transform non-streaming response** to OpenAI `chat.completion` format
2. **Add OpenAI parameter support** (temperature, max_tokens, top_p)
3. **Add comprehensive input validation** with Zod
4. **Implement OpenAI-compatible error responses**

### What NOT to Do ❌
- ❌ Auth middleware wrappers (not required for spec)
- ❌ Thread ownership verification (not part of spec)
- ❌ Enhanced logging (current is adequate)
- ❌ Usage tracking (not part of spec)
- ❌ Rate limiting (not required for spec)

### Next Steps
1. ✅ Review this revised plan
2. ✅ Approve minimal scope
3. ✅ Implement Priority 1-4 tasks (7-10 hours)
4. ✅ Test with OpenAI SDK
5. ✅ Validate full compliance

**Total estimated effort**: 7-10 hours

---

## References

- **OpenAI Chat Completions API**: https://platform.openai.com/docs/api-reference/chat/create
- **OpenAI Chat Completion Object**: https://platform.openai.com/docs/api-reference/chat/object
- **OpenAI Streaming Format**: https://platform.openai.com/docs/api-reference/chat-streaming
- **LangGraph SDK Docs**: https://langchain-ai.github.io/langgraphjs/
- **Better-Auth**: https://www.better-auth.com/

---

**Document Status**: 📝 Revised
**Next Review Date**: _________
**Approved By**: _________
**Implementation Start Date**: _________
