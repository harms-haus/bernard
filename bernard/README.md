# bernard agent API (Next.js + LangGraph)

Agent-style OpenAI/OpenRouter-compatible endpoint with scripted tools (web search, timer, geocoding, weather via lat/lon) and Redis-backed named tokens.

## Setup

1. Copy `env.example` to `.env` and fill values:
   - Model lists (comma-separated fallbacks): `RESPONSE_MODELS`, `INTENT_MODELS`, `AGGREGATION_MODELS`, `UTILITY_MODELS`
   - OpenRouter: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`
   - `REDIS_URL`
   - `SEARCH_API_KEY` (e.g., Brave search), `WEATHER_API_KEY` (OpenWeather)
   - `ADMIN_API_KEY` (used to create/list/delete tokens)
   - `RK_NAMESPACE` (optional; defaults to `bernard:rk` for the ledger)
2. Install deps: `npm install`
3. Run dev server: `npm run dev`

## Token management (admin)

```bash
curl -X POST http://localhost:3000/api/tokens \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ops"}'
```

- `POST /api/tokens` returns the token secret once (id, name, status, createdAt, token).
- `GET /api/tokens` returns `{ tokens: Token[] }` (no secrets).
- `GET /api/tokens/:id` returns `{ token: Token }` (no secrets).
- `PATCH /api/tokens/:id` to rename or toggle status (`active` | `disabled`).
- `DELETE /api/tokens/:id` removes a token entirely.
- Disabled tokens are rejected by `/api/v1/*` and `/api/history`.

## Status (admin)

- `GET /api/status` (bearer `$ADMIN_API_KEY`) returns the Bernard status snapshot, including RecordKeeper details.
- `GET /api/recordkeeper/status` (bearer `$ADMIN_API_KEY`) returns `{ status: RecordKeeperStatus }` for debugging and dashboards.

## History/recall endpoint

- `GET /api/history` with bearer token to search conversations; query params: `conversationId`, `place`, `keywords`, `since`, `until`, `limit`, `includeMessages=true`, `messageLimit`.
- `POST /api/history` with body `{"conversationId":"...","token?":"..."}` reopens a conversation and attaches it to the provided (or current) token.

## Chat endpoints (OpenAI-compatible)

`POST /api/v1/chat/completions` with bearer token created above.

```bash
curl -N http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"bernard-v1",
    "messages":[{"role":"user","content":"What is the weather in NYC then set a 5s timer."}],
    "stream": true
  }'
```

- Works with OpenAI SDKs by setting `baseURL` to your deployment and using the bearer token as the API key.
- Streaming uses `text/event-stream`. Set `"stream": false` for a single JSON response.
- Text completions: `POST /api/v1/completions` with a `prompt` instead of `messages`.

## Notes

- Tools: `web_search`, `set_timer`, `geocode_search`, `get_weather_current`, `get_weather_forecast`, `get_weather_historical`.
- Redis keys are namespaced under `bernard:tokens:*`.
- The graph is built with LangGraph + ChatOpenAI targeting OpenRouter by default. Update `OPENROUTER_*` envs and the category model lists to point at another endpoint if needed.
