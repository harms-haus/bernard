# Bernard Testing Improvements - Tasks B: API Routes Coverage
**Generated:** 2026-01-18
**Target Coverage:** 70% overall (currently ~35%)
**Focus Areas:** Admin API Routes, Service Test Routes, Thread Routes

## Coverage Status Summary

| Category | Total Files | Already Covered | Planned Coverage | Priority |
|----------|-------------|-----------------|------------------|----------|
| Admin Providers | 4 | 0 | 4 | P0 |
| Service Test Routes | 5 | 0 | 5 | P0 |
| Thread Routes (LangGraph) | 10 | 1 | 9 | P1 |
| Service Management | 4 | 2 | 2 | P1 |
| Token Management | 2 | 0 | 2 | P1 |
| User Management | 3 | 0 | 3 | P2 |
| Admin Settings | 4 | 1 | 3 | P2 |
| Auth Routes | 3 | 0 | 3 | P2 |
| Assistant Routes | 3 | 0 | 3 | P2 |
| Task Routes | 2 | 1 | 1 | P2 |
| Log Streaming | 1 | 0 | 1 | P1 |
| OpenAI-Compatible API | 2 | 0 | 2 | P0 |
| Health Endpoints | 4 | 4 | 0 | Already |
| **Total** | **47** | **9** | **38** | |

> **CRITICAL ADDITION**: The plan was missing critical OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/models`) which are the primary entry points for API clients. These are now added as P0.

## Executive Summary

This plan addresses the **38 API route files** needing coverage organized by functional area. All routes are Next.js App Router handlers using `NextRequest`/`NextResponse`. Routes form the backend API layer that frontend pages and hooks depend on.

### Files Already Covered (9 files)
- `core/src/app/api/health/route.ts`
- `core/src/app/api/health/ok/route.ts`
- `core/src/app/api/health/ready/route.ts`
- `core/src/app/api/health/stream/route.ts`
- `core/src/app/api/admin/route.ts`
- `core/src/app/api/admin/services/route.ts`
- `core/src/app/api/admin/backups/route.ts`
- `core/src/app/api/services/route.ts`
- `core/src/app/api/threads/[threadId]/auto-rename/route.ts`

### Files Needing Tests (38 files)
Detailed in phases below.

---

## Phase 0: OpenAI-Compatible API Routes (P0 - CRITICAL)

### 0.1 `/api/v1/chat/completions/route.ts` - OpenAI Chat Completions

**File Location:** `core/src/app/api/v1/chat/completions/route.ts`

**HTTP Methods:**
- `POST` - Chat completion with streaming support

**Dependencies:**
- LangGraph SDK Client (`@langchain/langgraph-sdk`)
- Environment: `BERNARD_AGENT_URL`

**Request Body:**
```typescript
{
  messages: Array<{ role: string; content: string }>;
  model?: string;
  thread_id?: string;
  stream?: boolean;
}
```

#### Test Scenarios

**Test 0.1.1: Validation**
```typescript
describe('POST /api/v1/chat/completions', () => {
  it('should return 400 for missing messages', async () => {
    // Make POST with {}
    // Expect 400 with 'messages is required'
  });

  it('should return 400 for empty messages array', async () => {
    // Make POST with { messages: [] }
    // Expect 400
  });
});
```

**Test 0.1.2: Thread Creation**
```typescript
describe('Thread Creation', () => {
  it('should create new thread when thread_id not provided', async () => {
    // Mock LangGraph SDK client.threads.create to return { thread_id: 'new-123' }
    // Make POST with messages, no thread_id
    // Verify thread created
  });

  it('should use provided thread_id', async () => {
    // Make POST with thread_id: 'existing-123'
    // Verify client.threads.create NOT called
  });
});
```

**Test 0.1.3: Non-Streaming Response**
```typescript
describe('Non-Streaming', () => {
  it('should return complete response', async () => {
    // Mock client.runs.create to return run
    // Mock client.runs.join to return result
    // Make POST with { stream: false }
    // Expect 200 with run result
  });
});
```

**Test 0.1.4: Streaming Response**
```typescript
describe('Streaming', () => {
  it('should set SSE headers', async () => {
    // Make POST with { stream: true }
    // Expect Content-Type: text/event-stream
    // Expect Cache-Control: no-cache
    // Expect Connection: keep-alive
    // Expect X-Accel-Buffering: no
  });

  it('should stream messages in SSE format', async () => {
    // Mock client.runs.stream to yield chunks
    // Make POST with { stream: true }
    // Verify data: prefix on each chunk
    // Verify [DONE] marker at end
  });
});
```

**Test 0.1.5: Error Handling**
```typescript
describe('Error Handling', () => {
  it('should return 500 on LangGraph client error', async () => {
    // Mock client.threads.create to throw
    // Make POST request
    // Expect 500
  });

  it('should send error in stream format', async () => {
    // Mock stream to throw error
    // Verify error chunk sent in SSE format
  });
});
```

### 0.2 `/api/v1/models/route.ts` - OpenAI Models List

**File Location:** `core/src/app/api/v1/models/route.ts`

**HTTP Methods:**
- `GET` - List available models

#### Test Scenarios

```typescript
describe('GET /api/v1/models', () => {
  it('should return models array', async () => {
    // Mock SettingsStore.getModelsSettings to return config
    // Make GET request
    // Expect 200 with models
  });

  it('should return empty array when no models configured', async () => {
    // Mock SettingsStore.getModelsSettings to return {}
    // Make GET request
    // Expect 200 with []
  });
});
```

---

## Phase 1: Admin Provider Routes Testing (P0)

### 1.1 `/api/admin/providers/route.ts` - Provider CRUD

**File Location:** `core/src/app/api/admin/providers/route.ts`

#### Implementation Analysis

The providers route handles LLM provider CRUD operations with authentication, validation, and Redis-backed storage.

**HTTP Methods:**
- `GET` - List all providers
- `POST` - Create new provider

**Dependencies:**
- `requireAdmin()` - Authentication guard (returns 403, not 401, when unauthorized)
- `SettingsStore` - Provider storage via `getProviders()`, `addProvider()`, `updateProvider()`, `deleteProvider()`
- No Zod validation in current implementation (manual validation only)
- Redis for data persistence

**POST Request Body:**
```typescript
{
  name: string;        // Required
  baseUrl: string;     // Required
  apiKey: string;      // Required
  type?: 'openai' | 'ollama';  // Optional, defaults to 'openai'
}
```

#### Test Scenarios

**Test 1.1.1: Authentication**
```typescript
describe('GET /api/admin/providers', () => {
  describe('Authentication', () => {
    it('should return 403 for unauthenticated request', async () => {
      // Mock requireAdmin to return null
      // Make request without session cookie
      // Expect 403 response with 'Admin access required'
    });

    it('should return 403 for non-admin user', async () => {
      // Mock requireAdmin with regular user (role: 'user')
      // Make request
      // Expect 403 response with error message
    });

    it('should return providers for admin user', async () => {
      // Mock requireAdmin with admin user
      // Mock SettingsStore.getProviders to return provider array
      // Make request
      // Expect 200 with providers list
    });
  });
});
```

**Test 1.1.2: GET Response**
```typescript
describe('GET Response', () => {
  it('should return empty array when no providers exist', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return []
    // Make request
    // Expect 200 with []
  });

  it('should return all providers with apiKeys visible', async () => {
    const mockProviders = [
      { id: '1', name: 'OpenAI', baseUrl: '...', apiKey: 'sk-secret', type: 'openai' },
      { id: '2', name: 'Ollama', baseUrl: '...', apiKey: 'ollama-key', type: 'ollama' }
    ];
    // Mock admin session
    // Mock SettingsStore.getProviders to return mockProviders
    // Make request
    // Expect 200 with providers (apiKeys NOT sanitized in current implementation)
  });

  it('should handle Redis errors gracefully', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to throw Redis error
    // Make request
    // Expect 500 with error message
  });
});
```

**Test 1.1.3: POST Validation**
```typescript
describe('POST /api/admin/providers', () => {
  it('should return 400 for missing name', async () => {
    // Mock admin session
    // Make POST with { baseUrl, apiKey } but no name
    // Expect 400 with validation error
  });

  it('should return 400 for missing baseUrl', async () => {
    // Mock admin session
    // Make POST with { name, apiKey } but no baseUrl
    // Expect 400 with validation error
  });

  it('should return 400 for missing apiKey', async () => {
    // Mock admin session
    // Make POST with { name, baseUrl } but no apiKey
    // Expect 400 with validation error
  });

  it('should return 400 for duplicate provider name', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return [{ name: 'Existing' }]
    // Make POST with { name: 'Existing', baseUrl, apiKey }
    // Expect 400 with 'Provider with this name already exists'
  });
});
```

**Test 1.1.4: POST Success**
```typescript
describe('POST Success', () => {
  it('should create provider and return 201', async () => {
    const providerData = {
      name: 'TestProvider',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key-123',
      type: 'openai'
    };
    // Mock admin session
    // Mock SettingsStore.getProviders to return []
    // Mock SettingsStore.addProvider to return { id: 'new-123', ...providerData }
    // Make POST with providerData
    // Expect 201 with created provider
    // Verify addProvider called with correct data
  });

  it('should default type to openai when not specified', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return []
    // Make POST without type field
    // Verify provider created with type: 'openai'
  });
});
```

**Test 1.1.5: Error Handling**
```typescript
describe('Error Handling', () => {
  it('should return 500 on Redis write failure', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return []
    // Mock SettingsStore.addProvider to throw error
    // Make POST request
    // Expect 500 with error message
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `requireAdmin()` | Auth guard | Mock return with user object or null |
| `SettingsStore.getProviders` | Fetch providers | Mock return array |
| `SettingsStore.addProvider` | Create provider | Mock return with id |

---

### 1.2 `/api/admin/providers/[id]/route.ts` - Single Provider Management

**File Location:** `core/src/app/api/admin/providers/[id]/route.ts`

**HTTP Methods:**
- `GET` - Fetch single provider
- `PUT` - Update provider
- `DELETE` - Remove provider

**URL Parameters:**
- `id` - Provider identifier

#### Test Scenarios

**Test 1.2.1: GET Single Provider**
```typescript
describe('GET /api/admin/providers/[id]', () => {
  it('should return 404 for non-existent provider', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return []
    // Make GET request
    // Expect 404 with 'Provider not found'
  });

  it('should return provider data', async () => {
    const mockProvider = { id: '1', name: 'OpenAI', baseUrl: '...', apiKey: '...', type: 'openai' };
    // Mock admin session
    // Mock SettingsStore.getProviders to return [mockProvider]
    // Make GET request
    // Expect 200 with provider data
  });
});
```

**Test 1.2.2: PUT Update Provider**
```typescript
describe('PUT /api/admin/providers/[id]', () => {
  it('should return 404 for non-existent provider', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return []
    // Make PUT request
    // Expect 404
  });

  it('should return 400 for empty update body', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return [{ id: '1', name: 'Test' }]
    // Make PUT with {}
    // Expect 400 (no validation implemented - empty body rejected by D1 check)
  });

  it('should update provider fields', async () => {
    const updateData = { name: 'NewName' };
    // Mock admin session
    // Mock SettingsStore.getProviders to return [{ id: '1', name: 'OldName' }]
    // Mock SettingsStore.updateProvider to return updated provider
    // Make PUT with updateData
    // Expect 200 with updated provider
    // Verify updateProvider called
  });
});
```

**Test 1.2.3: DELETE Provider**
```typescript
describe('DELETE /api/admin/providers/[id]', () => {
  it('should return 404 for non-existent provider', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return []
    // Make DELETE request
    // Expect 404
  });

  it('should delete provider and return 204', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return [{ id: '1' }]
    // Mock SettingsStore.deleteProvider to return true
    // Make DELETE request
    // Expect 204 with empty body
  });

  it('should return 500 on delete failure', async () => {
    // Mock admin session
    // Mock SettingsStore.getProviders to return [{ id: '1' }]
    // Mock SettingsStore.deleteProvider to return false
    // Make DELETE request
    // Expect 404 (false = not found)
  });
});
```

---

### 1.3 `/api/admin/providers/[id]/models/route.ts` - Fetch Provider Models

**File Location:** `core/src/app/api/admin/providers/[id]/models/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `GET` - Fetch available models from provider

**Dependencies:**
- External provider API call
- SettingsStore for provider config

**Behavior:**
- Proxies `/models` request to external OpenAI-compatible endpoint
- Handles authentication headers
- Returns array of model objects

#### Test Scenarios

**Test 1.3.1: Provider Not Found**
```typescript
describe('GET /api/admin/providers/[id]/models', () => {
  it('should return 404 if provider not found', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return null
    // Make GET request
    // Expect 404
  });
});
```

**Test 1.3.2: External API Call**
```typescript
describe('External API', () => {
  it('should proxy request to provider baseUrl', async () => {
    const mockProvider = { id: '1', baseUrl: 'https://api.openai.com', apiKey: 'sk-...' };
    // Mock admin session
    // Mock SettingsStore.getProvider to return mockProvider
    // Mock fetch to return models list
    // Make GET request
    // Verify fetch called with correct URL
  });

  it('should pass authorization header', async () => {
    const mockProvider = { id: '1', baseUrl: 'https://api.openai.com', apiKey: 'sk-test' };
    // Mock admin session
    // Mock SettingsStore.getProvider to return mockProvider
    // Mock fetch to return models
    // Make GET request
    // Verify Authorization header set correctly
  });

  it('should return 502 on provider API error', async () => {
    const mockProvider = { id: '1', baseUrl: 'https://api.openai.com', apiKey: 'sk-...' };
    // Mock admin session
    // Mock SettingsStore.getProvider to return mockProvider
    // Mock fetch to throw error or return 500
    // Make GET request
    // Expect 502 with upstream error
  });

  it('should return 502 on connection timeout', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock fetch to timeout
    // Make GET request
    // Expect 502 with timeout message
  });

  it('should return models on success', async () => {
    const mockModels = [
      { id: 'gpt-4', object: 'model' },
      { id: 'gpt-3.5-turbo', object: 'model' }
    ];
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock fetch to return mockModels
    // Make GET request
    // Expect 200 with models array
  });
});
```

---

### 1.4 `/api/admin/providers/[id]/test/route.ts` - Test Provider Connection

**File Location:** `core/src/app/api/admin/providers/[id]/test/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `POST` - Test provider connection

**Dependencies:**
- `SettingsStore.testProviderConnection()`
- External API call with test request

**Response:**
```typescript
{
  status: 'working' | 'failed';
  error?: string;
  errorType?: 'configuration' | 'unauthorized' | 'server_error' | 'timeout' | 'connection';
  testedAt: string;
}
```

#### Test Scenarios

**Test 1.4.1: Provider Not Found**
```typescript
describe('POST /api/admin/providers/[id]/test', () => {
  it('should return 404 if provider not found', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return null
    // Make POST request
    // Expect 404
  });
});
```

**Test 1.4.2: Connection Test Results**
```typescript
describe('Connection Tests', () => {
  it('should return working status on successful connection', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock testProviderConnection to return { status: 'working', testedAt: '...' }
    // Make POST request
    // Expect 200 with { status: 'working', ... }
  });

  it('should detect configuration errors', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock testProviderConnection to return {
    //   status: 'failed',
    //   errorType: 'configuration',
    //   error: 'Invalid baseUrl'
    // }
    // Make POST request
    // Expect 200 with errorType: 'configuration'
  });

  it('should detect authorization errors', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock testProviderConnection to return {
    //   status: 'failed',
    //   errorType: 'unauthorized',
    //   error: 'Invalid API key'
    // }
    // Make POST request
    // Expect 200 with errorType: 'unauthorized'
  });

  it('should detect server errors', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock testProviderConnection to return {
    //   status: 'failed',
    //   errorType: 'server_error',
    //   error: 'Internal server error'
    // }
    // Make POST request
    // Expect 200 with errorType: 'server_error'
  });

  it('should detect connection errors', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock testProviderConnection to return {
    //   status: 'failed',
    //   errorType: 'connection',
    //   error: 'Connection refused'
    // }
    // Make POST request
    // Expect 200 with errorType: 'connection'
  });

  it('should include testedAt timestamp', async () => {
    // Mock admin session
    // Mock SettingsStore.getProvider to return provider
    // Mock testProviderConnection to return {
    //   status: 'working',
    //   testedAt: '2024-01-01T00:00:00Z'
    // }
    // Make POST request
    // Expect testedAt in response
  });
});
```

---

## Phase 2: Service Integration Test Routes (P0)

### 2.1 `/api/admin/services/test/overseerr/route.ts` - Overseerr Test

**File Location:** `core/src/app/api/admin/services/test/overseerr/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `POST` - Test Overseerr connection

**Config Required:**
- `services.overseerr.baseUrl`
- `services.overseerr.apiKey`

**Test Behavior:**
- Makes GET request to `/search?query=test` endpoint
- 10 second timeout
- Validates response

#### Test Scenarios

**Test 2.1.1: Missing Configuration**
```typescript
describe('POST /api/admin/services/test/overseerr', () => {
  it('should return errorType configuration when config missing', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return {} (no overseerr config)
    // Make POST request
    // Expect 200 with { status: 'failed', errorType: 'configuration' }
  });

  it('should return error when baseUrl missing', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { overseerr: { apiKey: '...' } }
    // Make POST request
    // Expect 200 with errorType: 'configuration'
  });

  it('should return error when apiKey missing', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { overseerr: { baseUrl: '...' } }
    // Make POST request
    // Expect 200 with errorType: 'configuration'
  });
});
```

**Test 2.1.2: Connection Tests**
```typescript
describe('Connection Tests', () => {
  it('should return success when Overseerr is reachable', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return {
    //   overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test-key' }
    // }
    // Mock fetch to return success response with mock data
    // Make POST request
    // Expect 200 with { status: 'success' }
  });

  it('should detect unauthorized errors', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return valid config
    // Mock fetch to return 401
    // Make POST request
    // Expect 200 with { status: 'failed', errorType: 'unauthorized' }
  });

  it('should detect server errors', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return valid config
    // Mock fetch to return 500
    // Make POST request
    // Expect 200 with { status: 'failed', errorType: 'server_error' }
  });

  it('should timeout after 10 seconds', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return valid config
    // Mock fetch to delay response > 10 seconds
    // Make POST request
    // Expect 200 with { status: 'failed', errorType: 'timeout' }
  });

  it('should detect connection refused', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return valid config
    // Mock fetch to throw connection error
    // Make POST request
    // Expect 200 with { status: 'failed', errorType: 'connection' }
  });
});
```

---

### 2.2 `/api/admin/services/test/plex/route.ts` - Plex Test

**File Location:** `core/src/app/api/admin/services/test/plex/route.ts`

**Similar structure to Overseerr test** with:
- Config required: `baseUrl`, `token`
- Test: Fetches `/identity` from Plex
- Returns: `{ status: 'success' | 'failed', error?, machineIdentifier? }`

#### Test Scenarios

**Test 2.2.1: Configuration Validation**
```typescript
describe('POST /api/admin/services/test/plex', () => {
  it('should require baseUrl', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { plex: { token: '...' } }
    // Make POST request
    // Expect configuration error
  });

  it('should require token', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { plex: { baseUrl: '...' } }
    // Make POST request
    // Expect configuration error
  });
});
```

**Test 2.2.2: Connection Tests**
```typescript
describe('Connection Tests', () => {
  it('should return success with machineIdentifier', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return {
    //   plex: { baseUrl: 'http://plex:32400', token: 'test-token' }
    // }
    // Mock fetch to return { MediaContainer: { machineIdentifier: 'abc123' } }
    // Make POST request
    // Expect 200 with { status: 'success', machineIdentifier: 'abc123' }
  });

  it('should handle 401 unauthorized', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return valid config
    // Mock fetch to return 401
    // Make POST request
    // Expect 200 with unauthorized error
  });
});
```

---

### 2.3 `/api/admin/services/test/stt/route.ts` - STT Test

**File Location:** `core/src/app/api/admin/services/test/stt/route.ts`

**Config Required:**
- `baseUrl`
- Optional `apiKey`

**Test:** Health check on STT service
**Accepts:** 200 or 404 as success

#### Test Scenarios

**Test 2.3.1: Configuration**
```typescript
describe('POST /api/admin/services/test/stt', () => {
  it('should require baseUrl', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return {}
    // Make POST request
    // Expect configuration error
  });
});
```

**Test 2.3.2: Health Check**
```typescript
describe('Health Check', () => {
  it('should accept 200 as success', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { stt: { baseUrl: '...' } }
    // Mock fetch to return 200
    // Make POST request
    // Expect 200 with { status: 'success' }
  });

  it('should accept 404 as success (service has no health endpoint)', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { stt: { baseUrl: '...' } }
    // Mock fetch to return 404
    // Make POST request
    // Expect 200 with { status: 'success' }
  });

  it('should detect 500 as failure', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { stt: { baseUrl: '...' } }
    // Mock fetch to return 500
    // Make POST request
    // Expect 200 with server_error
  });

  it('should timeout on slow response', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { stt: { baseUrl: '...' } }
    // Mock fetch to delay > 10 seconds
    // Make POST request
    // Expect 200 with timeout error
  });
});
```

---

### 2.4 `/api/admin/services/test/tts/route.ts` - TTS Test

**File Location:** `core/src/app/api/admin/services/test/tts/route.ts`

**Same structure as STT test** with:
- Config: `baseUrl`, optional `apiKey`
- Test: Health check
- Accepts: 200 or 404 as success

#### Test Scenarios

Identical to STT tests - see section 2.3

---

### 2.5 `/api/admin/services/test/home-assistant/route.ts` - Home Assistant Test

**File Location:** `core/src/app/api/admin/services/test/home-assistant/route.ts`

**Config Required:**
- `baseUrl`
- `accessToken`

**Test:** GET request to HA API root with Bearer token

#### Test Scenarios

**Test 2.5.1: Configuration**
```typescript
describe('POST /api/admin/services/test/home-assistant', () => {
  it('should require baseUrl', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { homeAssistant: { accessToken: '...' } }
    // Make POST request
    // Expect configuration error
  });

  it('should require accessToken', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return { homeAssistant: { baseUrl: '...' } }
    // Make POST request
    // Expect configuration error
  });
});
```

**Test 2.5.2: Authentication**
```typescript
describe('Authentication', () => {
  it('should use Bearer token in Authorization header', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return {
    //   homeAssistant: { baseUrl: 'http://ha:8123', accessToken: 'token-123' }
    // }
    // Mock fetch to return 200
    // Make POST request
    // Verify fetch called with Authorization: 'Bearer token-123'
  });

  it('should return success on valid connection', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return valid config
    // Mock fetch to return 200 with HA data
    // Make POST request
    // Expect 200 with { status: 'success' }
  });

  it('should detect invalid token', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getServicesSettings to return valid config
    // Mock fetch to return 401
    // Make POST request
    // Expect 200 with unauthorized error
  });
});
```

---

## Phase 3: Thread Routes with Ownership (P1)

### 3.1 `/api/threads/route.ts` - Thread Listing/Creation

**File Location:** `core/src/app/api/threads/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `GET` - List threads (with user filter from session)
- `POST` - Create new thread (injects userId)

**Dependencies:**
- `getSession()` - Optional auth, provides userId
- `proxyToLangGraph()` - Proxies to Bernard agent

**Ownership Pattern:**
- GET: Adds `user_id` filter from session
- POST: Injects `userId` into thread metadata

#### Test Scenarios

**Test 3.1.1: GET Threads**
```typescript
describe('GET /api/threads', () => {
  it('should return threads for authenticated user', async () => {
    // Mock getSession with user { id: 'user-123' }
    // Mock proxyToLangGraph to return threads
    // Make GET request
    // Expect 200 with threads
    // Verify proxyToLangGraph called with user_id filter
  });

  it('should return all threads for admin', async () => {
    // Mock getSession with admin user
    // Make GET request
    // Verify no user_id filter applied
  });

  it('should return empty array when no threads', async () => {
    // Mock getSession with user
    // Mock proxyToLangGraph to return []
    // Make GET request
    // Expect 200 with []
  });

  it('should handle unauthenticated request', async () => {
    // Mock getSession to return null (no session)
    // Mock proxyToLangGraph to return []
    // Make GET request
    // Expect 200 with []
  });

  it('should return 502 on proxy error', async () => {
    // Mock getSession with user
    // Mock proxyToLangGraph to throw error
    // Make GET request
    // Expect 502
  });
});
```

**Test 3.1.2: POST Create Thread**
```typescript
describe('POST /api/threads', () => {
  it('should create thread with userId in metadata', async () => {
    // Mock getSession with user { id: 'user-123' }
    // Mock proxyToLangGraph to return new thread
    // Make POST with body { threadId: 'new-thread' }
    // Expect 200 with created thread
    // Verify proxyToLangGraph called with userId injected in body
  });

  it('should handle unauthenticated thread creation', async () => {
    // Mock getSession to return null
    // Make POST with body
    // Expect thread created without userId
  });

  it('should preserve existing metadata when injecting userId', async () => {
    // Mock getSession with user
    // Make POST with body containing existing metadata
    // Verify userId added but existing metadata preserved
  });

  it('should return 502 on proxy error', async () => {
    // Mock getSession with user
    // Mock proxyToLangGraph to throw error
    // Make POST request
    // Expect 502
  });
});
```

---

### 3.2 `/api/threads/[threadId]/route.ts` - Thread Management with Ownership

**File Location:** `core/src/app/api/threads/[threadId]/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `GET` - Fetch thread (with ownership check)
- `DELETE` - Delete thread (with ownership check)
- `PATCH` - Rename thread (with ownership check)

**Ownership Verification:**
- Fetches thread from LangGraph
- Compares `user_id` or `metadata.user_id` with session userId
- Returns 401 if no session, 403 if not owner

#### Test Scenarios

**Test 3.2.1: Ownership Verification**
```typescript
describe('GET /api/threads/[threadId]', () => {
  it('should return 401 for unauthenticated request', async () => {
    // Mock getSession to return null
    // Make GET request
    // Expect 401
  });

  it('should return 403 for non-owner', async () => {
    // Mock getSession with user { id: 'user-123' }
    // Mock proxyToLangGraph to return thread with user_id: 'user-456'
    // Make GET request
    // Expect 403 with 'Not authorized'
  });

  it('should return thread for owner', async () => {
    // Mock getSession with user { id: 'user-123' }
    // Mock proxyToLangGraph to return thread with user_id: 'user-123'
    // Make GET request
    // Expect 200 with thread
  });

  it('should check metadata.user_id for ownership', async () => {
    // Mock getSession with user { id: 'user-123' }
    // Mock proxyToLangGraph to return thread with metadata.user_id: 'user-123'
    // Make GET request
    // Expect 200
  });

  it('should return 502 on proxy error', async () => {
    // Mock getSession with user
    // Mock proxyToLangGraph to throw error
    // Make GET request
    // Expect 502
  });
});
```

**Test 3.2.2: DELETE Thread**
```typescript
describe('DELETE /api/threads/[threadId]', () => {
  it('should return 401 for unauthenticated', async () => {
    // Mock getSession to return null
    // Make DELETE request
    // Expect 401
  });

  it('should return 403 for non-owner', async () => {
    // Mock getSession with user
    // Mock proxyToLangGraph to return thread owned by different user
    // Make DELETE request
    // Expect 403
  });

  it('should delete thread for owner', async () => {
    // Mock getSession with user { id: 'user-123' }
    // Mock proxyToLangGraph to return thread with user_id: 'user-123'
    // Make DELETE request
    // Expect 204
    // Verify proxyToLangGraph called for delete
  });
});
```

**Test 3.2.3: PATCH Rename Thread**
```typescript
describe('PATCH /api/threads/[threadId]', () => {
  it('should return 401 for unauthenticated', async () => {
    // Mock getSession to return null
    // Make PATCH request
    // Expect 401
  });

  it('should return 403 for non-owner', async () => {
    // Mock getSession with user
    // Mock proxyToLangGraph to return thread owned by different user
    // Make PATCH request
    // Expect 403
  });

  it('should rename thread for owner', async () => {
    // Mock getSession with user { id: 'user-123' }
    // Mock proxyToLangGraph to return thread with user_id: 'user-123'
    // Make PATCH with { name: 'New Name' }
    // Expect 200 with updated thread
  });
});
```

---

### 3.3 Other Thread Routes

#### `/api/threads/[threadId]/runs/route.ts`
- `GET` - List runs for thread
- `POST` - Create new run

#### `/api/threads/[threadId]/runs/[runId]/route.ts`
- `GET` - Fetch run
- `DELETE` - Delete run

#### `/api/threads/[threadId]/runs/[runId]/join/route.ts`
- `GET` - Join run (proxy to LangGraph)

#### `/api/threads/[threadId]/runs/[runId]/stream/route.ts`
- `POST` - Stream run events (SSE)

#### `/api/threads/[threadId]/runs/[runId]/wait/route.ts`
- `POST` - Wait for run completion

#### `/api/threads/[threadId]/state/route.ts`
- `GET` - Get thread state
- `PUT` - Update thread state

#### `/api/threads/search/route.ts`
- `POST` - Search threads with server-side filtering

All these routes follow similar patterns - proxy to LangGraph with optional ownership checks. Tests should verify:
- Proxy forwarding works correctly
- Ownership checks pass/fail appropriately
- Streaming responses work (for stream route)
- Error handling (502/504)

---

## Phase 4: Service Management Routes (P1)

### 4.1 `/api/services/[service]/route.ts` - Service Control

**File Location:** `core/src/app/api/services/[service]/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `GET` - Get service status
- `POST` - Execute service action (start/stop/restart)

**URL Parameters:**
- `service` - Service name (whisper, kokoro, etc.)

#### Test Scenarios

**Test 4.1.1: GET Service Status**
```typescript
describe('GET /api/services/[service]', () => {
  it('should return service status', async () => {
    // Mock requireAuth
    // Mock ServiceManager.getStatus to return { status: 'running', port: 8870 }
    // Make GET request for 'whisper'
    // Expect 200 with status object
  });

  it('should handle unknown service', async () => {
    // Mock requireAuth
    // Mock ServiceManager.getStatus to return null
    // Make GET request for 'unknown'
    // Expect 404
  });

  it('should return 401 for unauthenticated', async () => {
    // Mock requireAuth to return null
    // Make GET request
    // Expect 401
  });
});
```

**Test 4.1.2: POST Service Action**
```typescript
describe('POST /api/services/[service]', () => {
  it('should start service', async () => {
    // Mock requireAuth
    // Mock ServiceManager.start to return { success: true }
    // Make POST with { action: 'start' }
    // Expect 200 with result
  });

  it('should stop service', async () => {
    // Mock requireAuth
    // Mock ServiceManager.stop to return { success: true }
    // Make POST with { action: 'stop' }
    // Expect 200
  });

  it('should restart service', async () => {
    // Mock requireAuth
    // Mock ServiceManager.restart to return { success: true }
    // Make POST with { action: 'restart' }
    // Expect 200
  });

  it('should return 400 for invalid action', async () => {
    // Mock requireAuth
    // Make POST with { action: 'invalid' }
    // Expect 400
  });

  it('should return 400 for missing action', async () => {
    // Mock requireAuth
    // Make POST with {}
    // Expect 400
  });

  it('should return 500 on service error', async () => {
    // Mock requireAuth
    // Mock ServiceManager.start to throw error
    // Make POST with { action: 'start' }
    // Expect 500 with error
  });
});
```

---

### 4.2 `/api/services/jobs/[jobId]/status/route.ts` - Job Status

**File Location:** `core/src/app/api/services/jobs/[jobId]/status/route.ts`

**Dependencies:** BullMQ via `getServiceJobStatus()`

#### Test Scenarios

**Test 4.2.1: GET Job Status**
```typescript
describe('GET /api/services/jobs/[jobId]/status', () => {
  it('should return job info', async () => {
    // Mock requireAuth
    // Mock getServiceJobStatus to return { id: 'job-123', status: 'completed' }
    // Make GET request
    // Expect 200 with job info
  });

  it('should return 404 for unknown job', async () => {
    // Mock requireAuth
    // Mock getServiceJobStatus to return null
    // Make GET request
    // Expect 404
  });

  it('should return 401 for unauthenticated', async () => {
    // Mock requireAuth to return null
    // Make GET request
    // Expect 401
  });
});
```

---

### 4.3 `/api/services/jobs/queue/route.ts` - Queue Listing

**File Location:** `core/src/app/api/services/jobs/queue/route.ts`

**Dependencies:** BullMQ via `getServiceJobs()`

#### Test Scenarios

**Test 4.3.1: GET Queue Jobs**
```typescript
describe('GET /api/services/jobs/queue', () => {
  it('should return all jobs', async () => {
    // Mock requireAuth
    // Mock getServiceJobs to return [
    //   { id: 'job-1', status: 'completed' },
    //   { id: 'job-2', status: 'running' }
    // ]
    // Make GET request
    // Expect 200 with jobs array
  });

  it('should filter by service query param', async () => {
    // Mock requireAuth
    // Make GET request with ?service=whisper
    // Verify getServiceJobs called with service filter
  });

  it('should return 401 for unauthenticated', async () => {
    // Mock requireAuth to return null
    // Make GET request
    // Expect 401
  });
});
```

---

### 4.3 `/api/services/route.ts` - All Services Status

**File Location:** `core/src/app/api/services/route.ts`

**HTTP Methods:**
- `GET` - Get all services status

**Dependencies:** `ServiceManager.getAllStatus()`

> **Note:** This route already has a test file (`route.test.ts`).

---

### 4.4 `/api/services/jobs/[jobId]/status/route.ts` - Job Status

**File Location:** `core/src/app/api/services/jobs/[jobId]/status/route.ts`

**Dependencies:** BullMQ via `getServiceJobStatus()`

#### Test Scenarios

**Test 4.4.1: GET Job Status**
```typescript
describe('GET /api/services/jobs/[jobId]/status', () => {
  it('should return job info', async () => {
    // Mock requireAuth
    // Mock getServiceJobStatus to return { id: 'job-123', status: 'completed' }
    // Make GET request
    // Expect 200 with job info
  });

  it('should return 404 for unknown job', async () => {
    // Mock requireAuth
    // Mock getServiceJobStatus to return null
    // Make GET request
    // Expect 404
  });

  it('should return 401 for unauthenticated', async () => {
    // Mock requireAuth to return null
    // Make GET request
    // Expect 401
  });
});
```

---

### 4.5 `/api/services/jobs/queue/route.ts` - Queue Listing

**File Location:** `core/src/app/api/services/jobs/queue/route.ts`

**Dependencies:** BullMQ via `getServiceJobs()`

#### Test Scenarios

**Test 4.5.1: GET Queue Jobs**
```typescript
describe('GET /api/services/jobs/queue', () => {
  it('should return all jobs', async () => {
    // Mock requireAuth
    // Mock getServiceJobs to return [
    //   { id: 'job-1', status: 'completed' },
    //   { id: 'job-2', status: 'running' }
    // ]
    // Make GET request
    // Expect 200 with jobs array
  });

  it('should filter by service query param', async () => {
    // Mock requireAuth
    // Make GET request with ?service=whisper
    // Verify getServiceJobs called with service filter
  });

  it('should return 401 for unauthenticated', async () => {
    // Mock requireAuth to return null
    // Make GET request
    // Expect 401
  });
});
```

---

## Phase 5: Token Management Routes (P1)

### 5.1 `/api/tokens/route.ts` - Token CRUD

**File Location:** `core/src/app/api/tokens/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `GET` - List all tokens (sanitized)
- `POST` - Create new token

**Security:** Tokens are sanitized (secret hidden) in list response

#### Test Scenarios

**Test 5.1.1: GET Tokens**
```typescript
describe('GET /api/tokens', () => {
  it('should return tokens without secrets', async () => {
    // Mock requireAdmin
    // Mock TokenStore.listTokens to return tokens with token field
    // Make GET request
    // Expect 200 with tokens
    // Verify token secret is masked or null
  });

  it('should return empty array when no tokens', async () => {
    // Mock requireAdmin
    // Mock TokenStore.listTokens to return []
    // Make GET request
    // Expect 200 with []
  });

  it('should return 403 for non-admin', async () => {
    // Mock requireAdmin to return regular user
    // Make GET request
    // Expect 403
  });

  it('should return 401 for unauthenticated', async () => {
    // Mock requireAdmin to return null
    // Make GET request
    // Expect 401
  });
});
```

**Test 5.1.2: POST Create Token**
```typescript
describe('POST /api/tokens', () => {
  it('should create token with name', async () => {
    // Mock requireAdmin
    // Mock TokenStore.createToken to return { id: 'tok-123', token: 'secret-xyz' }
    // Make POST with { name: 'My Token' }
    // Expect 201 with { id, name, status, createdAt, token: 'secret-xyz' }
  });

  it('should return 400 for missing name', async () => {
    // Mock requireAdmin
    // Make POST with {}
    // Expect 400
  });

  it('should return 400 for empty name', async () => {
    // Mock requireAdmin
    // Make POST with { name: '' }
    // Expect 400
  });

  it('should return 500 on creation error', async () => {
    // Mock requireAdmin
    // Mock TokenStore.createToken to throw error
    // Make POST request
    // Expect 500
  });
});
```

---

### 5.2 `/api/tokens/[id]/route.ts` - Single Token Management

**File Location:** `core/src/app/api/tokens/[id]/route.ts`

**HTTP Methods:**
- `GET` - Get token details (sanitized)
- `PATCH` - Update token (name, status)
- `DELETE` - Delete token

#### Test Scenarios

**Test 5.2.1: GET Token**
```typescript
describe('GET /api/tokens/[id]', () => {
  it('should return token without secret', async () => {
    // Mock requireAdmin
    // Mock TokenStore.getToken to return token with secret
    // Make GET request
    // Expect 200 with token (secret masked)
  });

  it('should return 404 for unknown token', async () => {
    // Mock requireAdmin
    // Mock TokenStore.getToken to return null
    // Make GET request
    // Expect 404
  });
});
```

**Test 5.2.2: PATCH Token**
```typescript
describe('PATCH /api/tokens/[id]', () => {
  it('should update token name', async () => {
    // Mock requireAdmin
    // Mock TokenStore.updateToken to return updated token
    // Make PATCH with { name: 'New Name' }
    // Expect 200 with updated token
  });

  it('should toggle token status', async () => {
    // Mock requireAdmin
    // Mock TokenStore.updateToken to return token with status: 'disabled'
    // Make PATCH with { status: 'disabled' }
    // Expect 200
  });

  it('should return 404 for unknown token', async () => {
    // Mock requireAdmin
    // Mock TokenStore.updateToken to return null
    // Make PATCH request
    // Expect 404
  });
});
```

**Test 5.2.3: DELETE Token**
```typescript
describe('DELETE /api/tokens/[id]', () => {
  it('should delete token', async () => {
    // Mock requireAdmin
    // Mock TokenStore.deleteToken to return true
    // Make DELETE request
    // Expect 204
  });

  it('should return 404 for unknown token', async () => {
    // Mock requireAdmin
    // Mock TokenStore.deleteToken to return false
    // Make DELETE request
    // Expect 404
  });
});
```

---

## Phase 10: Task Routes (P2)

### 10.1 `/api/tasks/[id]/route.ts` - Individual Task Management

**File Location:** `core/src/app/api/tasks/[id]/route.ts`

**HTTP Methods:**
- `GET` - Get task details
- `DELETE` - Delete task (if owner)

#### Test Scenarios

```typescript
describe('GET /api/tasks/[id]', () => {
  it('should return task', async () => {
    // Mock requireAuth
    // Mock getTaskKeeper to return task
    // Make GET request
    // Expect 200 with task
  });

  it('should return 404 for unknown task', async () => {
    // Mock getTaskKeeper to return null
    // Make GET request
    // Expect 404
  });
});

describe('DELETE /api/tasks/[id]', () => {
  it('should return 403 for non-owner', async () => {
    // Mock requireAuth with user-123
    // Mock getTaskKeeper to return task with userId: 'user-456'
    // Make DELETE request
    // Expect 403
  });

  it('should delete task for owner', async () => {
    // Mock requireAuth with user-123
    // Mock getTaskKeeper to return task with userId: 'user-123'
    // Make DELETE request
    // Expect 200 with success
  });
});
```

---

## Phase 11: Assistant Routes (P2)

### 11.1 `/api/assistants/route.ts` - Assistant List/Create

**File Location:** `core/src/app/api/assistants/route.ts`

**HTTP Methods:**
- `GET` - List assistants
- `POST` - Create assistant

**Dependencies:** Proxy to LangGraph

#### Test Scenarios

```typescript
describe('GET /api/assistants', () => {
  it('should proxy request to LangGraph', async () => {
    // Mock proxyToLangGraph
    // Make GET request
    // Expect proxyToLangGraph called with '/assistants'
  });
});

describe('POST /api/assistants', () => {
  it('should proxy request to LangGraph', async () => {
    // Mock proxyToLangGraph
    // Make POST with body
    // Expect proxyToLangGraph called with '/assistants'
  });
});
```

### 11.2 `/api/assistants/[assistantId]/route.ts` - Single Assistant

**File Location:** `core/src/app/api/assistants/[assistantId]/route.ts`

**HTTP Methods:**
- `GET` - Get assistant details
- `PATCH` - Update assistant
- `DELETE` - Delete assistant

### 11.3 `/api/assistants/search/route.ts` - Search Assistants

**File Location:** `core/src/app/api/assistants/search/route.ts`

**HTTP Methods:**
- `GET` - Search assistants

All assistant routes follow proxy pattern - tests should verify proxy forwarding.

### 6.1 `/api/users/route.ts` - User CRUD

**File Location:** `core/src/app/api/users/route.ts`

#### Implementation Analysis

**HTTP Methods:**
- `GET` - List all users (from Redis)
- `POST` - Create user (direct Redis write)

**Data Source:** Direct Redis access (Better-Auth schema)

#### Test Scenarios

**Test 6.1.1: GET Users**
```typescript
describe('GET /api/users', () => {
  it('should return all users', async () => {
    // Mock requireAdmin
    // Mock Redis to return user hashes
    // Make GET request
    // Expect 200 with { users: [...] }
  });

  it('should return empty array when no users', async () => {
    // Mock requireAdmin
    // Mock Redis to return empty
    // Make GET request
    // Expect 200 with { users: [] }
  });

  it('should return 403 for non-admin', async () => {
    // Mock requireAdmin to return regular user
    // Make GET request
    // Expect 403
  });
});
```

**Test 6.1.2: POST Create User**
```typescript
describe('POST /api/users', () => {
  it('should create user with required fields', async () => {
    // Mock requireAdmin
    // Mock Redis to return null (user doesn't exist)
    // Make POST with { id: 'new-user', displayName: 'New User', role: 'user' }
    // Expect 201 with { user: { id, displayName, role } }
  });

  it('should return 400 for missing id', async () => {
    // Mock requireAdmin
    // Make POST with { displayName: 'User', role: 'user' }
    // Expect 400
  });

  it('should return 400 for missing displayName', async () => {
    // Mock requireAdmin
    // Make POST with { id: 'user', role: 'user' }
    // Expect 400
  });

  it('should return 400 for duplicate user', async () => {
    // Mock requireAdmin
    // Mock Redis to return existing user
    // Make POST request
    // Expect 400 with 'User already exists'
  });
});
```

---

### 6.2 `/api/users/[id]/route.ts` - Single User Management

**File Location:** `core/src/app/api/users/[id]/route.ts`

**HTTP Methods:**
- `GET` - Get user details
- `PATCH` - Update user (displayName, role, status)
- `DELETE` - Delete user

#### Test Scenarios

**Test 6.2.1: GET User**
```typescript
describe('GET /api/users/[id]', () => {
  it('should return user', async () => {
    // Mock requireAdmin
    // Mock Redis to return user data
    // Make GET request
    // Expect 200 with user
  });

  it('should return 404 for unknown user', async () => {
    // Mock requireAdmin
    // Mock Redis to return null
    // Make GET request
    // Expect 404
  });
});
```

**Test 6.2.2: PATCH User**
```typescript
describe('PATCH /api/users/[id]', () => {
  it('should update displayName', async () => {
    // Mock requireAdmin
    // Mock Redis to return existing user
    // Make PATCH with { displayName: 'New Name' }
    // Expect 200
  });

  it('should update role', async () => {
    // Mock requireAdmin
    // Mock Redis to return existing user
    // Make PATCH with { role: 'admin' }
    // Expect 200
  });

  it('should update status', async () => {
    // Mock requireAdmin
    // Mock Redis to return existing user
    // Make PATCH with { status: 'disabled' }
    // Expect 200
  });
});
```

**Test 6.2.3: DELETE User**
```typescript
describe('DELETE /api/users/[id]', () => {
  it('should delete user', async () => {
    // Mock requireAdmin
    // Mock Redis to return user
    // Make DELETE request
    // Expect 204
  });

  it('should return 404 for unknown user', async () => {
    // Mock requireAdmin
    // Mock Redis to return null
    // Make DELETE request
    // Expect 404
  });
});
```

---

### 6.3 `/api/users/[id]/reset/route.ts` - User Reset

**File Location:** `core/src/app/api/users/[id]/reset/route.ts`

**HTTP Methods:**
- `POST` - Reset user

#### Test Scenarios

**Test 6.3.1: POST Reset**
```typescript
describe('POST /api/users/[id]/reset', () => {
  it('should reset user', async () => {
    // Mock requireAdmin
    // Mock Redis to return user
    // Make POST request
    // Expect 200 with { success: true, message: 'User reset' }
  });

  it('should return 404 for unknown user', async () => {
    // Mock requireAdmin
    // Mock Redis to return null
    // Make POST request
    // Expect 404
  });
});
```

---

## Phase 7: Admin Settings Routes (P2)

### 7.1 `/api/admin/limits/route.ts` - Limits Settings

**File Location:** `core/src/app/api/admin/limits/route.ts`

**HTTP Methods:**
- `GET` - Get limits configuration
- `PUT` - Update limits configuration

**Schema:**
```typescript
{
  maxThreads?: number;
  maxMessages?: number;
  maxConcurrentRuns?: number;
}
```

#### Test Scenarios

**Test 7.1.1: GET Limits**
```typescript
describe('GET /api/admin/limits', () => {
  it('should return limits config', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getLimitsSettings to return { maxThreads: 10 }
    // Make GET request
    // Expect 200 with limits object
  });
});
```

**Test 7.1.2: PUT Limits**
```typescript
describe('PUT /api/admin/limits', () => {
  it('should update limits', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.updateLimitsSettings to return updated config
    // Make PUT with { maxThreads: 20 }
    // Expect 200 with updated config
  });

  it('should return 400 for invalid values', async () => {
    // Mock requireAdmin
    // Make PUT with { maxThreads: -1 }
    // Expect 400
  });
});
```

---

### 7.2 `/api/admin/models/route.ts` - Model Settings

**File Location:** `core/src/app/api/admin/models/route.ts`

**HTTP Methods:**
- `GET` - Get model configuration
- `PUT` - Update model configuration

#### Test Scenarios

**Test 7.2.1: GET Models**
```typescript
describe('GET /api/admin/models', () => {
  it('should return model config', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.getModelsSettings to return config
    // Make GET request
    // Expect 200 with config
  });
});
```

**Test 7.2.2: PUT Models**
```typescript
describe('PUT /api/admin/models', () => {
  it('should update model config', async () => {
    // Mock requireAdmin
    // Mock SettingsStore.updateModelsSettings to return updated config
    // Make PUT with { providers: [...], defaultModel: 'gpt-4' }
    // Expect 200 with updated config
  });
});
```

---

### 7.3 `/api/admin/oauth/route.ts` - OAuth Settings

**File Location:** `core/src/app/api/admin/oauth/route.ts`

**HTTP Methods:**
- `GET` - Get OAuth settings
- `PUT` - Update OAuth settings

#### Test Scenarios

Similar to limits/routes - test GET/PUT with validation.

---

## Phase 8: Auth Routes (P2)

### 8.1 `/api/auth/get-session/route.ts` - Session Retrieval

**File Location:** `core/src/app/api/auth/get-session/route.ts`

**HTTP Methods:**
- `GET` - Get session or null

#### Test Scenarios

**Test 8.1.1: GET Session**
```typescript
describe('GET /api/auth/get-session', () => {
  it('should return session when authenticated', async () => {
    // Mock getSession to return session object
    // Make GET request
    // Expect 200 with { session }
  });

  it('should return null session when not authenticated', async () => {
    // Mock getSession to return null
    // Make GET request
    // Expect 200 with { session: null }
  });

  it('should return 500 on error', async () => {
    // Mock getSession to throw error
    // Make GET request
    // Expect 500
  });
});
```

---

### 8.2 `/api/auth/logout/route.ts` - Sign Out

**File Location:** `core/src/app/api/auth/logout/route.ts`

**HTTP Methods:**
- `GET` - Signs out and redirects

#### Test Scenarios

**Test 8.2.1: GET Logout**
```typescript
describe('GET /api/auth/logout', () => {
  it('should sign out and redirect', async () => {
    // Mock auth.signOut with callback
    // Make GET request
    // Expect redirect to /auth/login
  });
});
```

---

### 8.3 `/api/auth/[...all]/route.ts` - Better-Auth Catchall

**File Location:** `core/src/app/api/auth/[...all]/route.ts`

**HTTP Methods:**
- `GET`, `POST` - Delegates to Better-Auth

This route delegates entirely to Better-Auth. Tests should verify:
- GET requests are handled
- POST requests are handled
- Proper headers passed through

---

## Phase 9: Log Streaming Route (P1)

### 9.1 `/api/logs/stream/route.ts` - SSE Log Streaming

**File Location:** `core/src/app/api/logs/stream/route.ts`

**HTTP Methods:**
- `GET` - SSE stream of log entries

**Query Parameters:**
- `service` - Must be valid (core, redis, whisper, kokoro, bernard) or 'all'

#### Test Scenarios

**Test 9.1.1: Service Validation**
```typescript
describe('GET /api/logs/stream', () => {
  it('should return 400 for invalid service', async () => {
    // Make GET with ?service=invalid
    // Expect 400 with error
  });

  it('should accept valid services', async () => {
    const validServices = ['core', 'redis', 'whisper', 'kokoro', 'bernard', 'all'];
    for (const service of validServices) {
      // Make GET with ?service=${service}
      // Expect SSE stream response
    }
  });
});
```

**Test 9.1.2: SSE Response**
```typescript
describe('SSE Response', () => {
  it('should set correct headers', async () => {
    // Make GET with ?service=all
    // Expect Content-Type: text/event-stream
    // Expect no caching headers
  });

  it('should use LogStreamer to stream logs', async () => {
    // Mock LogStreamer
    // Make GET request
    // Verify LogStreamer.tail() and LogStreamer.watch() called
  });
   });
```

---

## Mock Infrastructure Requirements

> **Reference:** See `core/src/app/api/admin/route.test.ts` for the established testing pattern using `vi.spyOn()`.

### Global Mocks

Create shared mocks for API route testing:

```typescript
// core/src/test/mocks/api-routes.ts
export const mockAdminSession = {
  user: { id: 'admin-123', isAdmin: true },
  session: { id: 'session-123' }
};

export const mockUserSession = {
  user: { id: 'user-123', isAdmin: false },
  session: { id: 'session-456' }
};

export const mockNullSession = null;

export const createMockRequireAdmin = (session = mockAdminSession) => 
  vi.fn().mockResolvedValue(session);

export const createMockGetSession = (session = mockUserSession) =>
  vi.fn().mockResolvedValue(session);
```

### Route-Specific Mocks

```typescript
// Settings Store Mocks
export const mockSettingsStore = {
  getProviders: vi.fn(),
  getProvider: vi.fn(),
  addProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  getServices: vi.fn(),
  getServicesSettings: vi.fn(),
  setServices: vi.fn(),
  getLimitsSettings: vi.fn(),
  updateLimitsSettings: vi.fn(),
  getModelsSettings: vi.fn(),
  updateModelsSettings: vi.fn(),
  testProviderConnection: vi.fn(),
  // ... other methods
};

// Token Store Mocks
export const mockTokenStore = {
  listTokens: vi.fn(),
  getToken: vi.fn(),
  createToken: vi.fn(),
  updateToken: vi.fn(),
  deleteToken: vi.fn(),
};

// Service Manager Mocks
export const mockServiceManager = {
  getStatus: vi.fn(),
  getAllStatus: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
};

// LangGraph SDK Mocks
export const mockLangGraphClient = {
  threads: {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  runs: {
    create: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    join: vi.fn(),
    stream: vi.fn(),
  },
};

// Redis Mocks
export const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  hgetall: vi.fn(),
  hset: vi.fn(),
  // ... other methods
};
```

---

## Execution Order

### Priority Sequence

1. **Phase 0: OpenAI-Compatible API** (CRITICAL - Primary entry points)
   - `/api/v1/chat/completions/route.ts` (complex streaming, 167 lines)
   - `/api/v1/models/route.ts`

2. **Phase 1: Admin Provider Routes** (Core functionality)
   - `providers/route.ts` (CRUD)
   - `providers/[id]/route.ts` (Single provider)
   - `providers/[id]/models/route.ts` (Model fetching)
   - `providers/[id]/test/route.ts` (Connection test)

3. **Phase 2: Service Test Routes** (Integration tests)
   - All 5 service test routes (overseerr, plex, stt, tts, home-assistant)

4. **Phase 3: Thread Routes** (LangGraph proxy with ownership)
   - `threads/route.ts` (List/Create)
   - `threads/[threadId]/route.ts` (Ownership verification)
   - Other thread routes (7 files)

5. **Phase 4: Service Management** (Lifecycle control)
   - `services/[service]/route.ts`
   - `services/jobs/[jobId]/status/route.ts`
   - `services/jobs/queue/route.ts`

6. **Phase 5: Token Management** (API keys)
   - `tokens/route.ts`
   - `tokens/[id]/route.ts`

7. **Phase 6-9: User Management, Settings, Auth, Log Streaming**
   - User routes (3 files)
   - Admin settings (limits, models, oauth)
   - Auth routes (get-session, logout, catchall)
   - Log streaming route

8. **Phase 10-12: Task Routes, Assistants, Additional Admin**
   - Task routes (`tasks/[id]/route.ts`)
   - Assistant routes (3 files)
   - Status route, admin services, backups

### Estimated Effort

| Phase | Files | Est. Hours | Complexity |
|-------|-------|------------|------------|
| Phase 0 | 2 | 6-8 | High (streaming) |
| Phase 1 | 4 | 4-5 | Medium |
| Phase 2 | 5 | 3-4 | Low |
| Phase 3 | 10 | 6-8 | Medium (ownership) |
| Phase 4 | 3 | 2-3 | Low |
| Phase 5 | 2 | 2-3 | Low |
| Phases 6-9 | 10 | 4-5 | Low |
| Phases 10-12 | 7 | 3-4 | Low |
| **Total** | **43** | **30-40 hrs** | |

---

## Coverage Targets

| Route Category | Files | Already Covered | Target | Tests |
|----------------|-------|-----------------|--------|-------|
| OpenAI-Compatible | 2 | 0 | 90% | ~25 |
| Admin Providers | 4 | 0 | 90% | ~35 |
| Service Tests | 5 | 0 | 95% | ~30 |
| Thread Routes | 10 | 1 | 85% | ~45 |
| Service Management | 4 | 2 | 90% | ~20 |
| Token Management | 2 | 0 | 90% | ~15 |
| User Management | 3 | 0 | 85% | ~15 |
| Admin Settings | 4 | 1 | 85% | ~12 |
| Auth Routes | 3 | 0 | 80% | ~10 |
| Log Streaming | 1 | 0 | 90% | ~8 |
| Task Routes | 2 | 1 | 90% | ~8 |
| Assistant Routes | 3 | 0 | 70% | ~8 |
| **Total** | **43** | **5** | **85%** | **~231 tests** |

---

## Success Criteria

### Coverage Improvement

- **Current:** ~35% (9/47 files covered)
- **After Tasks B:** ~85% (40/47 files with tests)

### Test Quality

All API route tests must:
1. Test authentication/authorization (403 for unauthenticated/non-admin)
2. Test validation errors (400 cases)
3. Test success paths (200/201/204 cases)
4. Test error handling (500 cases)
5. Test proxy behavior (502/504 for LangGraph failures)
6. Mock external dependencies appropriately
7. Use existing test patterns (see `admin/route.test.ts`)

---

## Next Steps

1. Create shared mock utilities following existing patterns
2. Execute tests in priority order (Phase 0 first)
3. Add streaming tests for `/v1/chat/completions`
4. Verify coverage with `npm run test -- --coverage`
5. Document test patterns for future routes

**End of Tasks B**
