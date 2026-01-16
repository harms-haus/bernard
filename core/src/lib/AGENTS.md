# Lib - Shared Libraries

**Generated:** Fri Jan 16 2026
**Commit:** 8b0e23c
**Branch:** dev

## OVERVIEW
Core infrastructure modules for Bernard AI - authentication, configuration, service lifecycle, BullMQ queues, Redis client, logging, and external integrations.

## MODULES
- **api/** - HTTP client with auth headers, request/response types, health check endpoints
- **auth/** - Better-Auth with Redis adapter, OAuth providers, session/token stores
- **checkpoint/** - LangGraph Redis checkpoint saver with proper serialization (fixes bugs)
- **config/** - Settings schema with Zod, in-memory cache (5s TTL), model resolution
- **home-assistant/** - HA WebSocket/REST clients, entity states, color utilities
- **infra/** - BullMQ utility queue singleton, task persistence, service actions
- **logging/** - File-based logger with secret redaction, request context tracking
- **plex/** - Plex client factory, media search with ranking, device mapping
- **services/** - ServiceConfig types, HealthChecker, ServiceManager, ProcessManager
- **weather/** - OpenWeatherMap API, geocoding, unit conversion
- **website/** - Content extraction with caching (24h TTL)

## PATTERNS
- **Singleton**: `getRedis()`, `getUtilityQueue()`, `getAPIClient()` use module-level null checks
- **Result types**: Discriminated unions `{ok: true; data: T} | {ok: false; error: string}`
- **Lazy connect**: Redis clients use `lazyConnect: true` to prevent startup failures
- **Health checks**: Configurable timeouts, retry strategies, multi-method support (HTTP/docker/port)
- **Service types**: `"docker" | "node" | "python" | "cpp"` with typed ServiceConfig

## ANTI-PATTERNS
- **NO direct Redis imports**: Use `getRedis()` from infra/redis.ts only
- **NO hardcoded ports**: Define all ports in ServiceConfig.ts, reference via config.port
- **NO circular deps**: Config depends on nothing; auth depends on config only
- **NO new Redis clients**: Share singleton across checkpoint, queue, auth, infra
