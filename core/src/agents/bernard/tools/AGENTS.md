# Bernard Agent Tools

**Generated:** Sun Jan 11 2026  
**Commit:** 8b0e23c  
**Branch:** dev

## OVERVIEW
12 async tool factories providing web search, Wikipedia, weather, Home Assistant, Plex, and Overseerr integrations for Bernard voice assistant.

## TOOLS
| # | Tool | Factory | Description |
|---|------|---------|-------------|
| 1 | web_search | `webSearchToolFactory` | SearXNG-powered web search with progress reporting |
| 2 | get_website_content | `getWebsiteContentToolFactory` | Extract readable content from URLs via Readability.js |
| 3 | wikipedia_search | `wikipediaSearchToolFactory` | Wikipedia article search via SearXNG |
| 4 | wikipedia_entry | `wikipediaEntryToolFactory` | Retrieve Wikipedia article content with token slicing |
| 5 | get_weather_data | `getWeatherDataToolFactory` | Open-Meteo weather (current, hourly, daily, historical) |
| 6 | list_home_assistant_entities | `listHAEntitiesToolFactory` | List HA entities with domain/regex filtering |
| 7 | execute_home_assistant_services | `executeHomeAssistantServicesToolFactory` | Execute HA service calls (lights, media_player, etc.) |
| 8 | toggle_home_assistant_light | `toggleLightToolFactory` | Control lights (on/off, brightness, color) |
| 9 | get_home_assistant_historical_state | `getHistoricalStateToolFactory` | Retrieve entity state history (WebSocket + REST fallback) |
| 10 | play_media_tv | `playMediaTvToolFactory` | Search Plex and play on TV (power on, launch Plex, resume playback) |
| 11 | search_media | `searchMediaToolFactory` | Search Overseerr with Plex library enrichment |
| 12 | find_media_status | `findMediaStatusToolFactory` | Check Overseerr media availability by ID or search |
| - | request_media | `requestMediaToolFactory` | Request movies/TV via Overseerr |
| - | list_media_requests | `listMediaRequestsToolFactory` | List Overseerr requests with pagination |
| - | cancel_media_request | `cancelMediaRequestToolFactory` | Cancel pending Overseerr requests |
| - | report_media_issue | `reportMediaIssueToolFactory` | Report missing/broken/wrong media issues |

## PATTERNS

### Tool Factory Pattern
```typescript
type ToolFactory = () => Promise<ToolFactoryResult>;
type ToolFactoryResult = { ok: true; tool: StructuredTool } | { ok: false; name: string; reason: string };
```

### Validation Pattern
Tools validate configuration and external services before returning the tool:
```typescript
export const webSearchToolFactory: ToolFactory = async () => {
  const isValid = await verifySearchConfigured();
  if (!isValid.ok) {
    return { ok: false, name: "web_search", reason: isValid.reason ?? "" };
  }
  return { ok: true, tool: createWebSearchTool(deps), name: "web_search" };
};
```

### Progress Reporter
Long-running tools use `createProgressReporter` for status updates:
```typescript
const progress = createProgressReporter(config, "web_search");
progress.report(getSearchingUpdate());  // "Searching the web..."
await executeSearch(query, progress, count, deps);
progress.reset();
```

### Dependency Injection
Tools inject external dependencies for testability:
```typescript
export function createWebSearchTool(deps: WebSearchDependencies) {
  return tool(async ({ query }, _config) => {
    const progress = deps.createProgressReporter(_config, "web_search");
    return executeSearch(query, progress, count, starting_index, deps);
  }, { name: "web_search", schema: ... });
}
```

### Zod Schema Validation
All tools define Zod schemas for LangChain tool calling:
```typescript
schema: z.object({
  query: z.string().min(3),
  count: z.number().int().min(1).max(8).optional(),
  starting_index: z.number().int().min(1).optional().default(1),
})
```

## ANTI-PATTERNS (THIS MODULE)

- **NO `set_timer_sync`**: Use `set_timer` for background tasks (see `timer.tool.ts`)
- **NO markdown/emojis in responses**: Bernard outputs plain text for TTS audio synthesis
- **NO custom Error classes**: Use standard `Error` with discriminators `{ok: false; error}`
- **NO cross-service imports**: Tools must be standalone; copy dependencies, don't import from other services
- **NO direct LangGraph imports**: Use `LangGraphRunnableConfig` from `@langchain/langgraph`

## FILE REFERENCES

| File | Purpose |
|------|---------|
| `tools/index.ts` | Tool registry with barrel exports of all factories |
| `tools/types.ts` | `ToolFactory`, `ToolFactoryResult`, `DisabledTool` types |
| `tools/validation.ts` | `validateToolFactory()`, `validateAndGetTools()`, test helpers |
| `tools/timer.tool.ts` | `createTimerTool()` using `set_timer` (NOT `set_timer_sync`) |
| `tools/web-search.tool.ts` | Reference implementation with deps injection + progress reporter |
| `tools/overseerr-*.tool.ts` | Overseerr media management tools |
| `tools/home-assistant-*.tool.ts` | Home Assistant smart home control tools |

## KEY CONVENTIONS

1. **Factory always async**: Even if no validation needed, factories return `Promise<ToolFactoryResult>`
2. **Disabled tools return name**: `{ok: false; name: "tool_name"; reason: "..."}` for agent awareness
3. **Progress updates updates use.ts**: Random status messages from `getSearchingUpdate()`, `getReadingUpdate()`
4. **Config validation at factory level**: Services checked before tool is returned to agent
5. **Token-based slicing**: Wikipedia/website tools use `sliceTokensFromText()` for pagination
