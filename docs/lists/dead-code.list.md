# Dead/Abandoned Code Analysis

**Generated:** 2026-01-22
**Updated:** 2026-01-23
**Analysis Method:** Exhaustive cross-referencing of exports, imports, and usage patterns across the Bernard monorepo

---

## Summary

| Category | Count | Total Size |
|----------|--------|------------|
| External SDK Directories | 2 | 60MB |
| Unused Components | 16 | ~2,000 LOC |
| Unused Utility Functions | 19 | ~400 LOC |
| Unused Exports | 26 | ~500 LOC |
| Unused Types/Interfaces | 11 | ~200 LOC |
| Unused Config Schemas | 12 | ~150 LOC |
| Unused Middleware/Guards | 8 | ~150 LOC |
| Commented Code Blocks | 6 | ~100 LOC |
| Duplicate Implementations | 7 patterns | ~600 LOC |

**Estimated Total:** 120+ files/modules, 4,100+ LOC of dead/abandoned code

---

## Cleanup Priority Matrix

| Priority | Category | Impact | Effort | Items |
|----------|----------|--------|--------|-------|
| **CRITICAL** | External SDKs | High (60MB) | Low (2 dirs) | 2 directories |
| **HIGH** | Unused Components | High (2K LOC) | Medium (16 files) | 16 components |
| **HIGH** | Agent Inbox Feature | High (1K LOC) | Medium (9 files) | 8 components + 1 hook |
| **MEDIUM** | Unused Utilities | Medium (400 LOC) | Low (19 funcs) | 19 functions |
| **MEDIUM** | Unused Exports | Medium (500 LOC) | Low (26 exports) | 26 exports |
| **MEDIUM** | Duplicate Types | Medium (200 LOC) | Medium (4 types) | 4 consolidated types |
| **MEDIUM** | Unused Config Schemas | Medium (150 LOC) | Low (12 exports) | 12 exports |
| **LOW** | Commented Code | Low (100 LOC) | Low (6 blocks) | 6 blocks |
| **LOW** | Duplicate Implementations | Medium (600 LOC) | High (7 patterns) | 7 patterns |
| **VERY LOW** | Admin API Routes | Low (200 LOC) | Low (6 routes) | 6 routes (ACTIVE - KEEP) |

---

## PHASE 1: Critical (Immediate Deletion)

### 1.1 External SDK Directories (10/10 - DEFINITELY DEAD)

#### `/examples/langgraph/` (14MB)
- **Likelihood Dead:** 10/10
- **References:**
  - No imports from core codebase
  - Only test files reference this as external template
- **Description:** Complete LangGraph.js CLI and SDK repository copy
- **Includes:**
  - `libs/cli/` - Command-line interface
  - `libs/sdk/` - SDK implementation
  - `libs/langgraph/` - Core library
  - `examples/` - Multiple example projects
  - `package.json` with full dependency tree
- **Why Dead:** This is an external project copied into monorepo, not part of Bernard
- **Evidence:**
  - Has its own `pnpm-lock.yaml` (457KB) - separate dependency management
  - Tests use Jest (not Vitest like Bernard)
  - Not imported by any Bernard code
- **Potential Original Use:** Development reference or accidentally included during setup

#### `/examples/langgraphjs/` (46MB)
- **Likelihood Dead:** 10/10
- **References:**
  - No imports from core codebase
  - Test fixtures reference schema but only as mocks
- **Description:** Complete LangGraph.js SDK repository with multiple libraries
- **Includes:**
  - `libs/sdk/` - Main SDK
  - `libs/langgraph-core/` - Core functionality
  - `libs/langgraph-api/` - API layer
  - `libs/checkpoint-*` - Multiple checkpoint implementations
  - `libs/langgraph-cli/` - CLI tools
  - `examples/` - 20+ example projects
  - `docs/` - Full documentation site
  - `pnpm-lock.yaml` (457KB)
- **Why Dead:** External SDK with its own docs, tests, examples - not Bernard code
- **Evidence:**
  - Separate project structure with internal libraries
  - Not used by Bernard agent or API
  - Has own CHANGELOG.md, CONTRIBUTING.md
- **Potential Original Use:** Reference implementation or copy-paste for development

**Cleanup Impact:** Removing these would eliminate 60MB+ and 45+ orphaned test files

---

### 1.2 Agent Inbox Feature (9/10 - ALMOST CERTAINLY DEAD)

All components in `/core/src/components/chat/thread/agent-inbox/` appear to be from an abandoned feature that was fully implemented but never integrated:

#### `/core/src/components/chat/thread/agent-inbox/index.tsx` (ThreadView)
- **Likelihood Dead:** 9/10
- **Current References:** Zero production imports
- **Possible Original Use:** View agent inbox threads
- **Evidence:** Part of agent inbox UI that was never integrated

#### `/core/src/components/chat/thread/agent-inbox/components/state-view.tsx` (StateView)
- **Likelihood Dead:** 9/10
- **Current References:** Never imported
- **Possible Original Use:** Display thread state
- **Evidence:** Only exists, no consumers

#### `/core/src/components/chat/thread/agent-inbox/components/thread-actions-view.tsx` (ThreadActionsView)
- **Likelihood Dead:** 9/10
- **Current References:** Never imported
- **Possible Original Use:** Actions for thread management
- **Evidence:** Abandoned agent inbox feature

#### `/core/src/components/chat/thread/agent-inbox/components/thread-id.tsx` (ThreadIdCopyable)
- **Likelihood Dead:** 9/10
- **Current References:** Never imported
- **Possible Original Use:** Copy thread ID to clipboard
- **Evidence:** Unused inbox feature

#### `/core/src/components/chat/thread/agent-inbox/components/inbox-item-input.tsx` (InboxItemInput)
- **Likelihood Dead:** 9/10
- **Current References:** Never imported
- **Possible Original Use:** Input for inbox items
- **Evidence:** Part of abandoned inbox UI

#### `/core/src/components/chat/thread/agent-inbox/components/tool-call-table.tsx` (ToolCallTable)
- **Likelihood Dead:** 9/10
- **Current References:** Never imported
- **Possible Original Use:** Display tool calls in inbox
- **Evidence:** Inbox feature never shipped

#### `/core/src/components/chat/thread/agent-inbox/hooks/use-interrupted-actions.tsx` (useInterruptedActions)
- **Likelihood Dead:** 9/10
- **Current References:** Never imported
- **Possible Original Use:** Hook for interrupted action handling
- **Evidence:** Abandoned feature logic

#### `/core/src/components/chat/thread/messages/generic-interrupt.tsx` (GenericInterruptView)
- **Likelihood Dead:** 8/10
- **Current References:** Never imported
- **Possible Original Use:** Display generic interrupt messages
- **Evidence:** Created but never integrated

---

### 1.3 Unused React Components (8/10 - VERY LIKELY DEAD)

#### `/core/src/components/ProtectedRoute.tsx`
- **Likelihood Dead:** 8/10
- **Current References:** Only appears in test file imports
- **Possible Original Use:** Route protection wrapper for authenticated pages
- **Evidence:** Exported from components/index.ts but never imported in production

#### `/core/src/components/ServicePageClient.tsx`
- **Likelihood Dead:** 8/10
- **Current References:** Zero imports in production code
- **Possible Original Use:** Dashboard service management page
- **Evidence:** Service management now uses different components

#### `/core/src/components/dashboard/CombinedLogs.tsx`
- **Likelihood Dead:** 8/10
- **Current References:** No imports anywhere
- **Possible Original Use:** Unified log viewer for multiple services
- **Evidence:** Component exists but no pages use it

#### `/core/src/components/DarkModeToggle.tsx`
- **Likelihood Dead:** 7/10
- **Current References:** Not imported by any pages or components
- **Possible Original Use:** Theme switching UI component
- **Evidence:** Exported but unused in dashboard/chat

#### `/core/src/components/ui/password-input.tsx`
- **Likelihood Dead:** 8/10
- **Current References:** No production imports
- **Possible Original Use:** Password input field for auth
- **Evidence:** UI component defined but never used

#### `/core/src/components/dashboard/ServiceList.tsx`
- **Likelihood Dead:** 8/10
- **Current References:** Exported but never imported
- **Possible Original Use:** Display list of services in dashboard
- **Evidence:** Replaced by ServiceCard or other components

#### `/core/src/components/chat/ErrorState.tsx` (MessageErrorState)
- **Likelihood Dead:** 6/10
- **Current References:** Only used in test files: `ErrorState.test.tsx`
- **Possible Original Use:** Display error state in chat
- **Evidence:** Test-only component, production uses different error handling

#### `/core/src/components/icons/github.tsx` (GitHubSVG)
- **Likelihood Dead:** 9/10
- **Current References:** Zero imports (GitHub appears in useAuth.ts error messages but as text, not component)
- **Possible Original Use:** GitHub icon for OAuth button
- **Evidence:** Icon component defined but never used

---

## PHASE 2: High Priority (Week 1 - More Deletion)

### 2.1 Unused Utility Functions (7/10 - LIKELY DEAD)

#### `/core/src/utils/formatDuration.ts` (Entire module)
- **Likelihood Dead:** 9/10
- **Unused Exports:** `formatDuration(ms: number): string`
- **Current References:** Zero imports anywhere in codebase
- **Possible Original Use:** Convert milliseconds to human-readable time format
- **Evidence:** Function defined but never called; multiple local implementations exist in components
- **Note:** Dashboard components have their own implementations

#### `/core/src/lib/utils/string.ts` (Internal helpers)
- **Likelihood Dead:** 7/10
- **Unused Exports:**
  - `levenshteinDistance(str1, str2)` - Levenshtein distance algorithm
  - `calculateStringSimilarity(query, title)` - Simple similarity
  - `jaroSimilarity(s1, s2)` - Jaro algorithm
  - `jaroWinklerSimilarity(s1, s2, p)` - Jaro-Winkler algorithm
- **Current References:** Only `calculateStringSimilarityJaroWinkler` is used (by media-search.ts)
- **Possible Original Use:** Fuzzy string matching for media search, auto-renaming
- **Evidence:** Implementation details that should be private functions, not exports
- **Recommendation:** Make them private or remove if not needed

#### `/core/src/lib/tokenCounter.ts`
- **Likelihood Dead:** 6/10
- **Unused Exports:**
  - `getDefaultEncoding()` - Line 12
  - `countTokens(messages, encoding)` - Line 52
- **Current References:** `countTokensInText` and `sliceTokensFromText` ARE used
- **Possible Original Use:** Token counting for LLM messages
- **Evidence:** Partially used module, some exports dead

#### `/core/src/lib/searxng/index.ts`
- **Likelihood Dead:** 7/10
- **Unused Exports:**
  - `isTestEnvironment()` - Line 53
  - `normalizeApiKey(rawKey)` - Line 57
  - `normalizeApiUrl(rawUrl)` - Line 68
  - `resolveSearXNGConfigFromEnv(opts)` - Line 83
- **Current References:** Not imported anywhere (web-search.tool.ts has local duplicate implementations)
- **Possible Original Use:** SearXNG search service configuration
- **Evidence:** Duplicate implementations exist in web-search.tool.ts; these exports are dead

#### `/core/src/lib/weather/geocoding.ts`
- **Likelihood Dead:** 7/10
- **Unused Exports:**
  - `formatGeocodeResults(results)` - Line 130
- **Current References:** Defined but never called anywhere
- **Possible Original Use:** Format geocoding API responses
- **Evidence:** Helper function not used by weather tool

#### `/core/src/lib/config/settingsCache.ts`
- **Likelihood Dead:** 5/10
- **Unused Exports:**
  - `clearSettingsCache()` - Line 18
- **Current References:** Only used in test files, never in production
- **Possible Original Use:** Clear Redis cache for settings
- **Evidence:** Test-only utility

#### `/core/src/lib/config/settingsStore.ts`
- **Likelihood Dead:** 4/10
- **Unused Exports:**
  - `ensureDirectory(dir)` - Line 225
  - `parseJson(raw, schema)` - Line 231
  - `defaultModels()` - Line 247
  - `defaultServices()` - Line 254
  - `defaultBackups()` - Line 261
  - `defaultOauth()` - Line 268
- **Current References:** Only used in test files (`settingsCache.test.ts`, `appSettings.test.ts`)
- **Possible Original Use:** Test fixtures for configuration
- **Evidence:** Test helper functions exposed publicly but not used

---

### 2.2 Unused Exports (8/10 - VERY LIKELY DEAD)

#### `/core/src/lib/browser/index.ts` (Entire module unused)
- **Likelihood Dead:** 9/10
- **Unused Exports (10 total):**
  - Interfaces: `BrowserStorageAPI`, `BrowserLocationAPI`, `BrowserDocumentAPI`, `BrowserClipboardAPI`, `BrowserURLAPI`, `BrowserAPI`
  - Functions: `setBrowserAPI()`, `getBrowserAPI()`, `resetBrowserAPI()`
  - Constant: `browserAPI`
- **Current References:** Zero imports anywhere in codebase
- **Possible Original Use:** SSR/browser abstraction for compatibility layer
- **Evidence:** Complete browser abstraction layer that was likely replaced by direct browser API usage
- **Likelihood:** Historical migration code that's obsolete

#### `/core/src/lib/website/content-cache.ts`
- **Likelihood Dead:** 8/10
- **Unused Exports (5 total):**
  - Interface: `CacheEntry`
  - Functions: `get()`, `set()`, `clear()`, `getCacheStats()`
- **Current References:** Never imported anywhere
- **Possible Original Use:** Cache website content for web-search tool
- **Evidence:** Caching implementation defined but not integrated

#### `/core/src/components/chat/thread/api-key.ts`
- **Likelihood Dead:** 8/10
- **Unused Exports:**
  - `getApiKey(): string | null`
- **Current References:** Never imported anywhere
- **Possible Original Use:** Retrieve API key from localStorage for client-side auth
- **Evidence:** Authentication moved to better-auth system

#### `/core/src/components/chat/utils.ts`
- **Likelihood Dead:** 7/10
- **Unused Exports:**
  - `getContentString(content: Message['content']): string`
- **Current References:** Never imported anywhere
- **Possible Original Use:** Extract text from message content for display
- **Evidence:** Helper function that was superseded

---

### 2.3 Unused Types/Interfaces (8/10 - VERY LIKELY DEAD)

#### `/core/src/types/auth.ts`
- **Likelihood Dead:** 8/10
- **Unused Exports (6 total):**
  - `AuthAction` - Discriminated union for auth state actions
  - `APIError` - Error interface with status/details
  - `OAuthProvider` - `'github' | 'google'` (DUPLICATE of lib/auth/types.ts)
  - `LoginResponse` - User + accessToken (DUPLICATE of lib/api/types.ts)
  - `GenerateAccessTokenResponse` - Token + expiresAt (DUPLICATE of services/api.ts)
  - `UpdateProfileRequest` - displayName/email (DUPLICATE of lib/api/types.ts)
- **Current References:** Never imported (other duplicates ARE used in their respective locations)
- **Possible Original Use:** Shared auth types before refactoring
- **Evidence:** Types were duplicated during auth refactoring to better-auth

#### `/core/src/types/messageRecord.ts`
- **Likelihood Dead:** 7/10
- **Unused Exports (2 total):**
  - `MessageRecord` - Chat message interface
  - `TraceEvent` - LLM/tool call tracing
- **Current References:** MessageRecord marked "kept for backward compatibility" but never imported
- **Possible Original Use:** Old message format before migration
- **Evidence:** Legacy types from message system refactor

#### `/core/src/lib/overseerr/types.ts`
- **Likelihood Dead:** 7/10
- **Unused Exports (6 total):**
  - `FindMediaStatusParams` - Search params for media status
  - `RequestMediaParams` - Params for requesting media
  - `ListMediaRequestsParams` - Pagination/filter params
  - `CancelMediaRequestParams` - Cancel request params
  - `ReportMediaIssueParams` - Issue reporting params
  - `IssueResult` - Issue response type
- **Current References:** Never imported anywhere
- **Possible Original Use:** Type-safe parameter passing to Overseerr API
- **Evidence:** Overseerr tool uses inline types instead of these exports

---

### 2.4 Unused Config Schemas (7/10 - LIKELY DEAD)

#### `/core/src/lib/api/validation.ts`
- **Likelihood Dead:** 9/10
- **Unused Exports (4 total):**
  - `paginationSchema` - z.object({ limit, offset })
  - `serviceCommandSchema` - z.enum(['start', 'stop', 'restart'])
  - `serviceIdSchema` - z.object({ service: z.string() })
  - `taskActionSchema` - z.object({ taskId: z.string().uuid(), action: z.enum(['cancel']) })
- **Current References:** Never imported anywhere
- **Possible Original Use:** API request validation helpers
- **Evidence:** Helper functions `validateSchema` and `parseJsonBody` also unused

#### `/core/src/lib/config/agentModelRegistry.ts`
- **Likelihood Dead:** 8/10
- **Unused Exports:**
  - `AgentModelDefinitionSchema` (lines 47-57)
- **Current References:** Interfaces `ModelRoleDefinition` and `AgentModelDefinition` ARE used
- **Possible Original Use:** Runtime validation of agent model config
- **Evidence:** Schema defined but not used for validation

#### `/core/src/lib/langgraph/proxy.ts`
- **Likelihood Dead:** 7/10
- **Unused Exports:**
  - `LangGraphProxyOptions` interface (lines 9-15)
- **Current References:** Exported but never imported elsewhere
- **Possible Original Use:** Configuration for LangGraph proxying
- **Evidence:** Type exported for external use but never used

---

### 2.5 Unused Middleware/Guards (8/10 - VERY LIKELY DEAD)

#### `/core/src/lib/auth/server-helpers.ts`
- **Likelihood Dead:** 9/10
- **Unused Exports:**
  - `requireNonGuest()` - Line 48-49
- **Current References:** `denyGuest()` is used in `/core/src/app/api/status/route.ts`
- **Possible Original Use:** Guard for guest-only routes
- **Evidence:** Redundant export that was never adopted

#### `/core/src/lib/auth/client-helpers.ts`
- **Likelihood Dead:** 8/10
- **Unused Exports (4 total):**
  - `redirectToLogin()` - Only called internally
  - `redirectIfNotAuthenticated()` - Never imported
  - `redirectIfNotAdmin()` - Never imported
  - `getSession()` - Server-side version used everywhere
- **Current References:** Only `getSafeRedirect()` is imported (used in login page)
- **Possible Original Use:** Client-side auth redirects
- **Evidence:** Client-side auth helpers that were never integrated

#### `/core/src/lib/auth/hooks.ts`
- **Likelihood Dead:** 8/10
- **Unused Exports (2 total):**
  - `useSession()` - Never imported
  - `authenticatedFetch()` - Never imported
- **Current References:** Codebase uses `authClient.useSession()` directly via `useAuth.ts` hook
- **Possible Original Use:** Convenience wrappers around better-auth
- **Evidence:** Hooks superseded by direct useAuth implementation

---

### 2.6 Commented Code Blocks (5/10 - LOW PRIORITY)

#### `/core/src/lib/logging/logger.ts`
- **Lines:** 36-44
- **Content:** Complete 9-line `parseJsonOption()` function commented out
- **Likelihood Dead:** 8/10
- **Possible Original Use:** Parse JSON configuration with error handling
- **Evidence:** Disabled during config parsing refactor

#### `/examples/langgraphjs/libs/checkpoint-redis/src/index.ts`
- **Lines:** 693-699
- **Content:** Complete 7-line private method `loadChannelBlobs()` commented out
- **Likelihood Dead:** 9/10
- **Possible Original Use:** Load channel blobs from checkpoint storage
- **Evidence:** Legacy code from when blob storage was removed

#### `/docs/examples/langgraph-proxy.ts`
- **Lines:** 269-288
- **Content:** Multiple commented async function calls (20+ lines):
  - `nonStreamingExample()`
  - `streamingExample()`
  - `conversationExample()`
  - `streamWithCleanup()`
  - `callWithRetry()`
  - `streamWithTimeout()`
- **Likelihood Dead:** 6/10
- **Possible Original Use:** Example code for documentation
- **Evidence:** Disabled for active demo, kept as reference

#### `/examples/langgraphjs/libs/create-langgraph/src/tests/config.test.ts`
- **Lines:** 261-262
- **Content:** Commented code examples in test cases
- **Likelihood Dead:** 3/10
- **Possible Original Use:** Test examples
- **Evidence:** Intentional comments for regex testing

#### `/examples/langgraphjs/libs/langgraph-core/src/tests/python_port/interrupt.test.ts`
- **Line:** 542
- **Content:** Commented variable declaration `thread1root`
- **Likelihood Dead:** 6/10
- **Possible Original Use:** Test configuration for interrupt behavior
- **Evidence:** Debug code left in test file

#### `/examples/langgraphjs/examples/sql-agent/sql_agent.ts`
- **Line:** 389
- **Content:** Commented `Command` usage
- **Likelihood Dead:** 5/10
- **Possible Original Use:** Example of resume command
- **Evidence:** Code example for documentation

---

## PHASE 3: Investigation & Configuration (Week 2)

### 3.1 Dead Service Configurations (6/10 - LIKELY DEAD)

#### `/core/src/lib/searxng/index.ts`
- **Likelihood Issue:** 7/10
- **Issue:** `DEFAULT_SEARXNG_API_URL = "https://searxng.example.com/search"`
- **Problem:** Points to non-existent example.com domain
- **Current References:**
  - Used by web-search tool when `SEARXNG_API_URL` env var not set
- **Impact:** Search tool will fail silently if misconfigured
- **Recommendation:** Replace with real public instance or document required config

#### Memory Service Schema (Defined But Deferred)
- **Likelihood Dead:** 6/10
- **Location:** `/core/src/lib/config/appSettings.ts:144-151`
- **Schema:** `MemoryServiceSchema` fully defined with embeddingModel, embeddingBaseUrl, etc.
- **Current References:**
  - Exported in `ServicesSettingsSchema` (line 238)
  - Types exported (lines 280-286, 349)
  - BUT system explicitly deferred: "No memory fields - memory system deferred to future implementation" (bernard/state.ts:4)
- **Recommendation:** Implement memory system or remove unused schema

#### Test Fixture Mock Configurations
- **Likelihood Dead:** 3/10
- **Location:** `/core/src/test/fixtures/config.ts:55-81`
- **Config:**
  - `memory: { embeddingModel, embeddingBaseUrl: 'http://localhost:11434' }` - Ollama (optional)
  - `overseerr: { baseUrl: 'http://localhost:5055' }` - External service
  - `plex: { baseUrl: 'http://localhost:32400' }` - External service
  - `homeAssistant: { baseUrl: 'http://localhost:8123' }` - External service
- **Current References:** Only used in test fixtures
- **Recommendation:** Document Ollama requirement or mark as optional

---

## PHASE 4: Refactoring (Week 3 - Consolidation)

### 4.1 Duplicate Implementations (4/10 - CONSOLIDATION OPPORTUNITIES)

#### Result Type Pattern (7 occurrences)
- **Likelihood Duplicate:** 9/10
- **Locations:**
  - `/core/src/agents/bernard/types.ts` - `Result<T>` type
  - `/core/src/lib/services/ServiceConfig.ts` - Inline `ServiceResult` type
  - `/core/src/lib/auth/session.ts` - `SessionResult` type
  - `/core/src/lib/services/service.ts` - `ServiceResponse` interface
  - Multiple tool files - Inline return types
- **Pattern:** `{ok: true; data: T} | {ok: false; error: string}`
- **Why Duplicate:** Each module defines its own Result type variant
- **Consolidation Opportunity:** Create central `Result<T>` type in `/core/src/lib/result.ts`

#### Tool Factory Pattern (12 near-identical files)
- **Likelihood Duplicate:** 8/10
- **Files:** All 12 files in `/core/src/agents/bernard/tools/`
- **Pattern:** Each has ~50-80 lines of boilerplate factory function with identical structure:
  ```typescript
  export async function createTool(): Promise<{ok: true; tool} | {ok: false; name, reason}> {
    // Similar error handling, validation, configuration
  }
  ```
- **Consolidation Opportunity:** Create base `createToolFactory<T>()` helper

#### API Handler Pattern (4 similar files)
- **Likelihood Duplicate:** 7/10
- **Files:**
  - `/core/src/app/api/chat.post.ts`
  - `/core/src/app/api/agent.post.ts`
  - `/core/src/app/api/stt.post.ts`
  - `/core/src/app/api/tts.post.ts`
- **Pattern:** Try/catch → JSON response with error handling (~20 lines each)
- **Consolidation Opportunity:** Abstract to helper in `/core/src/lib/api.ts`

#### Service Client Duplication
- **Likelihood Duplicate:** 6/10
- **Files:**
  - `/core/src/lib/services/whisper.ts`
  - `/core/src/lib/services/kokoro.ts`
  - `/core/src/lib/infra/http.ts` (partial overlap)
- **Pattern:** HTTP client setup with timeout, retry logic
- **Consolidation Opportunity:** Generic `ServiceClient<T>` in `/core/src/lib/services/http-client.ts`

#### Configuration Schema Duplication
- **Likelihood Duplicate:** 7/10
- **Files:**
  - `/core/src/lib/services/ServiceConfig.ts`
  - `/core/src/lib/config.ts`
  - `/core/src/lib/auth/config.ts`
- **Pattern:** Zod schema + validation
- **Consolidation Opportunity:** Base `createConfigSchema<T>()` utility

#### Error Handling Middleware Duplication
- **Likelihood Duplicate:** 6/10
- **Files:**
  - `/core/src/app/api/chat.post.ts` - error catch block
  - `/core/src/lib/services/service.ts` - error transformation
  - `/core/src/lib/auth/session.ts` - error transformation
- **Consolidation Opportunity:** Centralize error handling

#### Service Configuration Pattern
- **Likelihood Duplicate:** 7/10
- **Files:**
  - `/core/src/lib/services/whisper.ts`
  - `/core/src/lib/services/kokoro.ts`
- **Pattern:** Identical interface:
  ```typescript
  export interface ServiceConfig {
    baseUrl: string;
    timeout: number;
  }
  ```
- **Consolidation Opportunity:** Generic `ServiceConfig<T>` interface

#### Tool Metadata Duplication
- **Likelihood Duplicate:** 8/10
- **Files:** All 12 tool files
- **Pattern:** Each has identical metadata extraction:
  ```typescript
  const TOOL_META: ToolMeta = {
    name: "...",
    description: "...",
    parameters: { ... }
  };
  ```
- **Consolidation Opportunity:** Extract to `/core/src/lib/agents/tool-meta.ts`

---

### 4.2 Duplicated Types (Should Consolidate - 5/10)

**Note:** These ARE used, but defined in multiple places:

#### `LoginResponse`
- **Primary Location:** `/core/src/lib/api/types.ts:9`
- **Also Defined In:** `/core/src/types/auth.ts:26`, `/core/src/services/api.ts:8`
- **Why Duplicate:** Auth refactoring created multiple versions

#### `UpdateProfileRequest`
- **Primary Location:** `/core/src/lib/api/types.ts:14`
- **Also Defined In:** `/core/src/types/auth.ts:38`, `/core/src/services/api.ts:18`

#### `UserStatus`
- **Primary Location:** `/core/src/lib/auth/userStore.ts:5`
- **Also Defined In:** `/core/src/types/auth.ts:2`

#### `OAuthProvider`
- **Primary Location:** `/core/src/lib/auth/types.ts:35`
- **Also Defined In:** `/core/src/types/auth.ts:31` (different value: "default" vs union)

---

## ACTIVE CODE (DO NOT DELETE)

### Admin API Routes (2/10 - LIKELY ACTIVE)

The following routes are actively used via `adminApiClient` and should NOT be deleted:

#### `/core/src/app/api/admin/route.ts`
- **Likelihood Dead:** 2/10 (likely active)
- **Current References:**
  - Server-side usage: Returns all settings via `adminApiClient.getSettings()`
  - Part of admin dashboard bulk settings loading
- **Evidence:** Uses `requireAdmin()` guard, returns schema from Redis

#### `/core/src/app/api/admin/models/route.ts`
- **Likelihood Dead:** 2/10 (likely active)
- **Current References:**
  - `adminApiClient.getModelsSettings()` - line 518
  - `adminApiClient.updateModelsSettings()` - line 533
- **Test Coverage:** Referenced in test files
- **Evidence:** Route exists with proper implementation, GET/PUT handlers

#### `/core/src/app/api/admin/oauth/route.ts`
- **Likelihood Dead:** 2/10 (likely active)
- **Current References:**
  - `adminApiClient.getOAuthSettings()` - line 685
  - `adminApiClient.updateOAuthSettings()` - line 688
- **Evidence:** Returns `OAuthSettingsSchema` from Redis

#### `/core/src/app/api/admin/limits/route.ts`
- **Likelihood Dead:** 2/10 (likely active)
- **Current References:**
  - `adminApiClient.getLimitsSettings()` - line 707
  - `adminApiClient.updateLimitsSettings()` - line 710
- **Evidence:** Uses `requireAdmin()` guard, returns schema

#### `/core/src/app/api/admin/providers/[id]/route.ts`
- **Likelihood Dead:** 2/10 (likely active)
- **Current References:**
  - `adminApiClient.getProvider()` - line 552
  - `adminApiClient.updateProvider()` - line 556
  - `adminApiClient.deleteProvider()` - line 562
- **Evidence:** Part of provider management system

#### `/core/src/app/api/admin/providers/[id]/models/route.ts`
- **Likelihood Dead:** 2/10 (likely active)
- **Current References:**
  - `adminApiClient.getProviderModels()` - line 581
- **Evidence:** Fetches OpenAI models for provider

**Note:** These routes all have clear client-side usage via `adminApiClient`. The absence of raw imports is expected - the API client handles all communication.

---

## Recommended Cleanup Plan

### Phase 1: Critical (Immediate)
1. **Remove External SDKs** (with verification)
   - **Pre-delete Verification Steps:**
     - Audit test fixture dependencies referencing these SDKs
     - Run developer usage survey to confirm no active references
     - Create backup branch before deletion
     - Run full test suite to identify any breakage
     - Document rollback procedure
   - Delete `/examples/langgraph/` (14MB)
   - Delete `/examples/langgraphjs/` (46MB)
   - **Impact:** 60MB savings, eliminates 50+ orphaned test files
   - **Note:** If verification reveals test dependencies or active usage, move to Phase 5 (Investigation) instead

2. **Remove Agent Inbox Components**
   - Delete `/core/src/components/chat/thread/agent-inbox/` directory
   - Delete `generic-interrupt.tsx`
   - **Impact:** ~1,000 LOC, removes abandoned feature

3. **Remove Unused Dashboard Components**
   - Delete: `ProtectedRoute.tsx`, `ServicePageClient.tsx`, `CombinedLogs.tsx`, `DarkModeToggle.tsx`, `ServiceList.tsx`, `password-input.tsx`, `GitHubSVG.tsx`
   - **Impact:** ~1,000 LOC, cleaner component structure

### Phase 2: High Priority (Week 1)
4. **Remove Unused Utility Modules**
   - Delete: `formatDuration.ts` (entire module)
   - Make string utility functions private or unused
   - Remove unused exports from `tokenCounter.ts`, `searxng/index.ts`, `geocoding.ts`
   - **Impact:** ~200 LOC, smaller bundle size

5. **Remove Unused Exports**
   - Delete: `lib/browser/index.ts` (entire module)
   - Delete: `lib/website/content-cache.ts` (entire module)
   - Remove unused exports from `chat/thread/api-key.ts`, `chat/utils.ts`
   - **Impact:** ~300 LOC

6. **Remove Unused Types/Schemas**
   - Delete unused types from `types/auth.ts`, `messageRecord.ts`, `overseerr/types.ts`
   - Delete unused Zod schemas from `api/validation.ts`, `agentModelRegistry.ts`
   - Consolidate duplicated types
   - **Impact:** ~250 LOC, clearer type system

7. **Remove Unused Middleware/Guards**
   - Remove `requireNonGuest()` from `server-helpers.ts`
   - Remove unused exports from `client-helpers.ts`, `hooks.ts`
   - **Impact:** ~150 LOC

### Phase 3: Investigation (Week 2)
8. **Fix Service Configurations**
   - Replace SearXNG default URL or document requirement
   - Implement memory system or remove schema
   - **Impact:** Better configuration, no code removal

### Phase 4: Low Priority (Week 3)
9. **Remove Commented Code**
   - Uncomment or delete commented blocks in `logger.ts`, checkpoint files, example files
   - **Impact:** ~100 LOC, cleaner codebase

10. **Address Duplicate Implementations**
    - Create central `Result<T>` type
    - Abstract tool factory pattern
    - Consolidate API handler pattern
    - **Impact:** ~600 LOC consolidated (net -400 after original code removed)

---

## Verification Checklist

Before removing any code:

- [ ] Check git history for last modification date
- [ ] Search for any documentation references
- [ ] Check if item is exported in barrel files
- [ ] Run `npm run type-check` to verify no type errors
- [ ] Run `npm run lint` to verify no linting issues
- [ ] Run `npm run test` to verify no test failures
- [ ] Create feature branch for cleanup
- [ ] Commit changes in logical groups

---

## Notes

### External SDKs

The `examples/langgraph/` and `examples/langgraphjs/` directories contain complete copies of external LangGraph SDK repositories. These are NOT Bernard code:
- Have their own package.json with full dependency trees
- Use Jest for testing (Bernard uses Vitest)
- Have internal libraries, documentation, examples
- Not imported or used by Bernard agent or API

These appear to have been copied for development reference but should either:
1. Be removed (recommended)
2. Be moved outside monorepo as git submodule
3. Be documented as reference material

### Agent Inbox Feature

The entire `agent-inbox/` directory appears to be an abandoned feature. All components:
- Are exported from barrel files
- Have zero production imports
- Have zero usage in pages or routes
- Appear to be a UI feature that was never integrated

### Duplicate Types

The auth types have significant duplication after refactoring to better-auth. Consolidating these would:
- Reduce confusion about which type to use
- Prevent divergence
- Make future changes easier

### Test-Only Exports

Several utilities in `settingsStore.ts` are exported but only used in tests:
- `defaultModels()`, `defaultServices()`, `defaultBackups()`, `defaultOauth()`
- These should either be moved to `test/fixtures/` or marked as test-only

---

## Estimated Cleanup Impact

### Code Reduction

- **Total LOC to Remove:** 4,100+
- **Total Files/Directories:** 120+
- **Bundle Size Reduction:** ~50-100KB (after minification)
- **Repository Size Reduction:** 60MB (external SDKs)

### Maintenance Impact

- **Reduced Confusion:** Clearer component structure
- **Fewer Questions:** Less dead code to investigate
- **Easier Onboarding:** New developers won't be confused by unused code
- **Cleaner Type System:** Consolidated types reduce ambiguity

### Risk Assessment

| Category | Risk Level | Blast Radius | Recovery Cost | Notes |
|----------|------------|--------------|---------------|-------|
| **External SDKs** | Medium | High (test fixtures may break) | Medium (restore from backup) | Test fixtures reference schemas as mocks; requires audit before deletion |
| **Unused Components** | Low | Low (isolated components) | Low (restore from git) | Check for dynamic imports and feature flags before removal |
| **Unused Exports** | Low | Low (unused code) | Low (restore from git) | Verify no dynamic imports or conditional usage |
| **Admin API Routes** | Low | Medium (server-side routes) | Medium (restore + verify) | **KEEP** - actively used via adminApiClient |
| **Duplicate Implementations** | Medium | Medium (multiple files) | Medium (careful refactoring) | Requires careful testing after consolidation |
| **Test Breakage** | Medium | High (test suite) | High (fix all tests) | Test-only items may have hidden dependencies; run full suite before removal |
| **Unused Utilities** | Low | Low (isolated functions) | Low (restore from git) | Verify no dynamic imports or feature flags |

---

**END OF ANALYSIS**
