# Core - Agents & Libraries

**Generated:** Sun Jan 11 2026
**Commit:** 8b0e23c
**Branch:** dev

## OVERVIEW
LangGraph agent with tool factory pattern, prompt system for Bernard voice assistant, and shared libraries for auth, services, infrastructure, logging, and third-party integrations.

## STRUCTURE
```
core/src/
├── agents/                    # LangGraph agent (port 2024)
│   └── bernard/
│       ├── tools/               # 12 tool factories (search, wikipedia, weather, HA, media)
│       ├── prompts/             # System prompt builders (react, response)
│       ├── bernard.agent.ts     # Agent creation with LangGraph + middleware
│       ├── configuration.ts     # Config annotation (empty, future use)
│       ├── state.ts             # Messages state with standard reducer
│       ├── utils.ts             # Progress reporter for tool status
│       └── updates.ts           # Random status messages (searching, reading, etc.)
└── lib/                       # Shared libraries
    ├── auth/              # Session-based auth with OAuth (GitHub, Google)
    ├── config/            # Settings schema, cache, model resolution
    ├── services/          # Service lifecycle, health checks, process mgmt
    ├── infra/             # BullMQ queues, Redis client, task persistence
    ├── logging/           # File-based logging with redaction
    ├── home-assistant/    # HA API client and entity management
    ├── plex/              # Plex media server integration
    ├── weather/           # Weather data fetching (OpenWeatherMap)
    └── website/           # Website content extraction
```

## WHERE TO LOOK
| Task | Location | Notes |
|-------|----------|-------|
| Tool factories | `agents/bernard/tools/index.ts` | Registry of all 12 tool factories |
| Tool validation | `agents/bernard/tools/validation.ts` | Validates config, returns disabled list |
| Agent creation | `agents/bernard/bernard.agent.ts` | LangGraph with Redis checkpoint + middleware |
| System prompts | `agents/bernard/prompts/` | React router and response prompts |
| State management | `agents/bernard/state.ts` | Messages state with reducer |
| Progress updates | `agents/bernard/utils.ts`, `updates.ts` | Tool status reporting |
| Service registry | `lib/services/ServiceConfig.ts` | All 7 services with ports/commands |
| Service manager | `lib/services/ServiceManager.ts` | Lifecycle, dependencies, startup order |
| Process control | `lib/services/ProcessManager.ts` | Spawn/stop processes, PID tracking |
| Health checking | `lib/services/HealthChecker.ts` | HTTP health checks with timeouts |
| Log streaming | `lib/services/LogStreamer.ts` | Process logs with redaction |
| Session storage | `lib/auth/sessionStore.ts` | Redis-backed session storage |
| Settings cache | `lib/config/settingsCache.ts` | In-memory cache with refresh |
| API routes | `lib/config/models.ts` | Model selection and validation |
| BullMQ queue | `lib/infra/queue.ts` | Utility queue singleton |
| Service actions | `lib/infra/service-queue/` | Async service command queue |

## CONVENTIONS
- **Tool factory pattern**: Async functions returning `{ok: true; tool} | {ok: false; name, reason}`
- **Progress reporting**: `createProgressReporter(config, toolName)` for tool status updates
- **Prompts with TZ awareness**: `toLocaleString(undefined, {timeZone})` for time display
- **Singleton pattern**: Lazy initialization with `getUtilityQueue()`, `getRedisClient()`
- **Settings**: Zod schema validation, JSON file persistence, in-memory cache
- **Service types**: `docker`, `node`, `python`, `cpp` (defined in ServiceConfig)
- **Health checks**: HTTP with configurable timeout/retry, returns `HealthStatus`
- **Process spawning**: Uses `node:child_process` with stdio piping for logs
- **Log redaction**: Auto-redacts secrets (API keys, tokens) via regex patterns
- **Redis client**: Singleton with connection pooling, automatic reconnection

## ANTI-PATTERNS (THIS MODULE)
- **NO cross-service imports**: Bernard agent must be standalone (copy code, don't import)
- **NO emojis/markdown in agent responses**: Bernard outputs plain text for TTS
- **NO custom Error classes**: Use standard Error with discriminators
- **NO `set_timer_sync`**: Use `set_timer` for background tasks
- **NO circular dependencies**: Auth depends on config, config depends on nothing
- **NO direct Redis access**: Use `redisClient` singleton from infra
- **NO hardcoded ports**: All service ports defined in ServiceConfig.ts
