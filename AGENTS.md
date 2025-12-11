# AGENTS

## Purpose and shape

- Bernard is an AI assistant pipeline: device capture → Home Assistant ingress → agent API → model/tool loop → streamed text back for TTS and device UX.
- Treat current code as scaffolding. Patterns and contracts here should survive new tools, harnesses, and transport variants.

## Architecture patterns

- Stateless graph: a LangGraph-style loop alternates model output and tool execution until tools are exhausted, then streams partial tokens as `text/event-stream`. Keep nodes single-purpose and composable.
- Token-gated access: bearer tokens map to friendly metadata in Redis; lookups fail fast with 401s. Namespaces prevent collisions.
- Short, synchronous tools: favor quick, deterministic calls. External calls use strict timeouts and parameterized endpoints. Examples: a small web search helper, a brief in-process timer, or a weather fetcher that takes lat/lon directly.
- Human-ready tool outputs: tools return concise summaries already suitable for the model to quote; avoid dumping raw JSON.
- Prompt harnesses: prompts live with their calling harness; they set clear roles, delimit tool schemas, and keep output streaming-friendly. Use examples sparingly and update them when behavior shifts.
- Device-first ingress: the ESPHome profile drives wake states and local UX; cloud pieces stay stateless so reconnects are cheap. Secrets remain in device `secrets.yaml`.

## Operational expectations

- Config by environment: model keys/URL, Redis URL, search API key/URL, admin key, and overrideable weather/search endpoints. Missing config should error loudly.
- Default to streaming; return full JSON only when explicitly requested by a caller.
- Prefer explicit failures over silent fallbacks; log without leaking secrets.
- Keep modules small and responsibility-scoped; remove dead code rather than layering shims.
- Time-budget external calls; bound result counts to keep latency predictable.

## Build, test, run (API side)

- Prereqs: Node LTS + npm; copy the sample env and fill required keys before running.
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build` then `npm run start`
- Lint: `npm run lint`
- Tests: `npm test` (node:test via tsx over `tests/`)

## Tool and harness guidance for growth

- Add tools as single-purpose modules with tight schemas and short execution windows; make endpoints configurable. Use an example like the existing search helper: parameterize API URL/key, cap results, and return a brief summary.
- Keep timers conversational, not schedulers; if blocking, cap duration (e.g., ~60s) and surface completion states to the device.
- When adding data fetchers (e.g., another weather source), accept explicit coordinates/targets and prefer no-key providers unless necessary; if a key is needed, guard with environment configuration and user agent requirements.
- Harnesses should isolate their prompts, describe available tools inline, and avoid recursion; update sample dialogues when tool behavior changes.

## Device and ingress notes

- The ESP32-S3 profile handles wake-word selection, local states (idle/listening/thinking/replying/error/muted/timer-finished), and media for timers. Builds run via the provided script, writing a factory binary; flashing and onboarding happen through Home Assistant ingress.

## Interaction flow (expected)

- Voice/text → ingress → bearer-authenticated request to the agent → model/tool loop → streamed text back → device updates display/audio as needed.

## Forward-looking principles

- Favor clean breaks over compatibility layers: change call sites rather than add shims.
- Guard new external calls with timeouts and meaningful error messaging.
- Keep outputs concise and human-ready; avoid leaking secrets in any surface.
- Document new patterns here when they emerge; use existing tools and harnesses only as examples, not an exhaustive list.
