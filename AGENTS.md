# AGENTS

## What we are building

- Bernard is an AI assistant pipeline that runs an ESPHome ingress device and forwards conversations through Home Assistant to an OpenRouter-backed LLM via a LangGraph agent.
- The device handles wake words, STT/TTS, and on-device status UX; the backend focuses on reasoning, calling small scripted tools, and enforcing token-based access.
- Keep descriptions generic and forward-looking: use current code as examples, but treat it as scaffolding rather than the final shape.

## Components

- Bernard Agent API (Next.js + LangGraph + ChatOpenAI/OpenRouter)
  - Stateless agent graph that routes between the model node and a tool node until no tool calls remain, then streams updates as `text/event-stream`.
  - Exposes a chat endpoint that accepts OpenAI-style message arrays and optional streaming; uses bearer tokens for auth.
  - Uses Redis for token validation and simple global caching; token metadata is namespaced for safety.
- Token service (Redis-backed)
  - Admin-only endpoints create/list/delete named tokens; tokens are long random hex strings stored separately from metadata.
  - Validation looks up tokens to recover the friendly name/metadata; failures are 401s to keep the surface minimal.
- Tooling set (scripted, synchronous where possible)
  - `web_search`: hits a configurable search API (default Brave) with bearer auth; limit count to small numbers to bound latency.
  - `set_timer`: short-lived timers (<=60s) using in-process delays; only for conversational pacing, not scheduling.
  - `geocode_search`: forward geocoding via OpenStreetMap Nominatim; requires a user agent and respects optional language/country hints.
  - `get_weather_current`: Open-Meteo current conditions for provided coordinates (lat, lon).
  - `get_weather_forecast`: Open-Meteo forecast for provided coordinates and target date/time.
  - `get_weather_historical`: Open-Meteo historical weather for provided coordinates and target date/time.
- Ingress device (ESPHome, ingress mode)
  - ESP32-S3-Box voice assistant profile with display states (idle/listening/thinking/replying/error/muted/timer-finished).
  - Wake-word selection (on-device micro_wake_word vs HA-provided) and media player for timer alarms.
  - Uses `secrets.yaml` for Wi-Fi and any sensitive values; build produces a factory binary for flashing.

## Tech and practices

- Next.js 16 app router, TypeScript, LangGraph, ioredis; tests use `node:test` via `tsx`.
- Environment-driven config: OpenRouter keys/model/base URL, Redis URL, search API key/URL, admin API key; keep weather/search endpoints overrideable via env.
- Prefer explicit failures over fallbacks; reject missing/invalid auth early.
- Keep modules small and responsibility-scoped; no compatibility shims. Remove dead code.
- Default to streaming responses; only send full JSON when explicitly requested.
- Ask questions early when requirements are ambiguous; optimize for clarity over cleverness.

## Build, test, run

- Agent API
  - Prereqs: Node LTS, npm. Copy the sample env file to a local env and populate required keys (OpenRouter, Redis, search, admin).
  - Install deps: `npm install`.
  - Dev server: `npm run dev` (Next.js).
  - Production build: `npm run build`; start with `npm run start`.
  - Lint: `npm run lint`.
  - Tests: `npm test` (runs `tsx --test` over the `tests/` tree).
- Tooling considerations
  - `web_search` requires a search API key; return a friendly message when missing.
  - `set_timer` blocks the worker; keep durations short and avoid queuing long timers.
  - Weather tools use Open-Meteo; endpoints are overrideable, and no API key is required by default. Supply lat/lon directly; units default to imperial for likely-US coordinates unless overridden.
  - `geocode_search` calls Nominatim; set `NOMINATIM_USER_AGENT` (and optional `NOMINATIM_EMAIL`/`NOMINATIM_REFERER`) to comply with usage policy.
- Token service
  - Requires a reachable Redis instance; namespace tokens under a dedicated prefix to avoid collisions.
  - Admin actions are bearer-protected; rotate the admin key regularly and avoid reusing it for other services.
- Ingress (ESPHome, ingress mode)
  - Prereqs: Docker (for the ESPHome image) and a `secrets.yaml` containing Wi-Fi and any other required secrets.
  - Build: run the provided build script; it mounts a RAM-backed cache and writes a factory binary into the `bin/` directory.
  - Flash the factory binary to the ESP32-S3-Box; onboarding happens through Home Assistant ingress.
  - No automated tests here—validate by pairing with HA, exercising wake word, STT→LLM→TTS loop, and the timer alarm.

## Interaction model (intended)

- Voice captured on the device → Home Assistant voice pipeline → text request to Bernard Agent API with a bearer token → LangGraph routes between model and tools → response text returned for TTS → device updates display state and plays audio when needed (e.g., timer).
- Keep prompts/tool outputs concise; prefer single-pass tool calls over deep recursion.

## Expectations for future agents

- Keep breaking changes clean: update call sites rather than layering shims.
- When extending tools, add focused schemas and return human-ready summaries.
- Guard external calls with timeouts and meaningful error messages.
- Avoid leaking secrets in logs or responses; treat env and `secrets.yaml` as the single sources of truth.
