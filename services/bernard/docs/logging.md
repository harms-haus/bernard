# Logging

- **Stack:** Pino with JSON output; prettified in dev when `LOG_PRETTY=true` or `NODE_ENV` is not `production`.
- **Base fields:** `service`, `env`, optional `version` (from `VERCEL_GIT_COMMIT_SHA` or `npm_package_version`).
- **Levels:** default `info` (`LOG_LEVEL` overrides). Tool/LLM failures log as `error`, successes as `info`, traces as `debug`.
- **Redaction:** keys matching `apiKey`, `token`, `authorization`, `secret`, `password`, and similar nested keys are censored as `[redacted]`.
- **Context fields:** `requestId`, `conversationId`, `turnId`, `queueItemId`, `jobId`, `userId`, `adminId`, `actor`, `route`, `stage`, `component`.
- **Transports:** set `LOG_TRANSPORT_TARGET` (and optional JSON `LOG_TRANSPORT_OPTIONS`) to send logs elsewhere; stdout stays default. Pretty output is only for local dev.
- **Helpers:** use `buildRequestLogger` for API handlers, `childLogger`/`withRequestContext` for module-scoped logs, and `startTimer()` for duration fields.
- **Major events:**
  - LLM calls: `llm.call.start/success/error` with model, duration, tool counts, usage.
  - Tools: `tool.success/error/exception` with durations and arg keys.
  - Orchestrator: `orchestrator.run.start/success/error` with response preview and router turns.
  - Queue: enqueue/start/complete/fail events with job metadata.
  - Admin actions: settings changes (diffed keys), token/user/memory actions, conversation views/close/delete with actor IDs.
  - Requests: `api.request.start/success/error` via request logger (adds correlation IDs).
