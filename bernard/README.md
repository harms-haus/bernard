# bernard agent API (Next.js + LangGraph)

Agent-style OpenAI/OpenRouter-compatible endpoint with scripted tools (web search, timer, weather) and Redis-backed named tokens.

## Setup

1. Copy `env.example` to `.env.local` and fill values:
   - `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`
   - `REDIS_URL`
   - `SEARCH_API_KEY` (e.g., Brave search), `WEATHER_API_KEY` (OpenWeather)
   - `ADMIN_API_KEY` (used to create/list/delete tokens)
   - `SUMMARY_MODEL` (optional; defaults to `OPENROUTER_MODEL` for conversation summaries)
   - `RK_NAMESPACE` (optional; defaults to `bernard:rk` for the ledger)
2. Install deps: `npm install`
3. Run dev server: `npm run dev`

## Token management (admin)

```
curl -X POST http://localhost:3000/api/tokens \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ops","note":"ops usage"}'
```

- `GET /api/tokens` lists metadata (no secrets).
- `DELETE /api/tokens` with body `{"name":"ops"}` removes a token.

## History/recall endpoint

- `GET /api/history` with bearer token to search conversations; query params: `conversationId`, `place`, `keywords`, `since`, `until`, `limit`, `includeMessages=true`, `messageLimit`.
- `POST /api/history` with body `{"conversationId":"...","token?":"..."}` reopens a conversation and attaches it to the provided (or current) token.

## Chat endpoint

`POST /api/agent` with bearer token created above.

```
curl -N http://localhost:3000/api/agent \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages":[{"role":"user","content":"What is the weather in NYC then set a 5s timer."}],
    "stream": true
  }'
```

- Streaming uses `text/event-stream`. Set `"stream": false` for a single JSON response.

## Notes

- Tools: `web_search`, `set_timer`, `get_weather`.
- Redis keys are namespaced under `bernard:tokens:*`.
- The graph is built with LangGraph + ChatOpenAI targeting OpenRouter by default. Update `OPENROUTER_*` envs to point at another endpoint if needed.



