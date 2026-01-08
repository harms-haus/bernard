# Merge Checklist: Bernard-Agent → Bernard-API

## Phase 1: Preparation

- [ ] Create git commit with current state (backup)
- [ ] Review plan document at `docs/plans/merge-bernard.plan.md`
- [ ] Verify all files in bernard-agent are accounted for

## Phase 2: Create Directory Structure

- [ ] Create `services/bernard-api/src/agents/bernard/`
- [ ] Create `services/bernard-api/src/lib/config/`
- [ ] Create `services/bernard-api/src/lib/home-assistant/`
- [ ] Create `services/bernard-api/src/lib/plex/`
- [ ] Create `services/bernard-api/src/lib/weather/`
- [ ] Create `services/bernard-api/src/lib/website/`
- [ ] Create `services/bernard-api/src/lib/logging/`
- [ ] Create `services/bernard-api/tests/plex/`
- [ ] Create `services/bernard-api/tests/infra/`
- [ ] Create `services/bernard-api/scripts/`

## Phase 3: Move Agent Code

- [ ] Move `services/bernard-agent/src/bernard-agent/bernard.agent.ts`
- [ ] Move `services/bernard-agent/src/bernard-agent/configuration.ts`
- [ ] Move `services/bernard-agent/src/bernard-agent/state.ts`
- [ ] Move `services/bernard-agent/src/bernard-agent/updates.ts`
- [ ] Move `services/bernard-agent/src/bernard-agent/utils.ts`
- [ ] Move `services/bernard-agent/src/bernard-agent/prompts/`
- [ ] Move `services/bernard-agent/src/bernard-agent/tools/`

## Phase 4: Move Library Code

### Config Library
- [ ] Move `services/bernard-agent/src/lib/config/settingsStore.ts`
- [ ] Move `services/bernard-agent/src/lib/config/settingsCache.ts`
- [ ] Move `services/bernard-agent/src/lib/config/models.ts`
- [ ] Move `services/bernard-agent/src/lib/config/index.ts`

### Home Assistant Library
- [ ] Move `services/bernard-agent/src/lib/home-assistant/websocket-client.ts`
- [ ] Move `services/bernard-agent/src/lib/home-assistant/rest-client.ts`
- [ ] Move `services/bernard-agent/src/lib/home-assistant/entities.ts`
- [ ] Move `services/bernard-agent/src/lib/home-assistant/context.ts`
- [ ] Move `services/bernard-agent/src/lib/home-assistant/color-utils.ts`
- [ ] Move `services/bernard-agent/src/lib/home-assistant/verification.ts`
- [ ] Move `services/bernard-agent/src/lib/home-assistant/index.ts`

### Plex Library
- [ ] Move `services/bernard-agent/src/lib/plex/client.ts`
- [ ] Move `services/bernard-agent/src/lib/plex/media-search.ts`
- [ ] Move `services/bernard-agent/src/lib/plex/actions.ts`
- [ ] Move `services/bernard-agent/src/lib/plex/device-mapping.ts`
- [ ] Move `services/bernard-agent/src/lib/plex/plex-api.d.ts`
- [ ] Move `services/bernard-agent/src/lib/plex/index.ts`

### Weather Library
- [ ] Move `services/bernard-agent/src/lib/weather/common.ts`
- [ ] Move `services/bernard-agent/src/lib/weather/geocoding.ts`
- [ ] Move `services/bernard-agent/src/lib/weather/index.ts`

### Website Library
- [ ] Move `services/bernard-agent/src/lib/website/content-cache.ts`
- [ ] Move `services/bernard-agent/src/lib/website/index.ts`

### Infra Library
- [ ] Move `services/bernard-agent/src/lib/infra/queue.ts`
- [ ] Move `services/bernard-agent/src/lib/infra/thread-naming-job.ts`
- [ ] Move `services/bernard-agent/src/lib/infra/timeouts.ts`
- [ ] Move `services/bernard-agent/src/lib/infra/redis.ts`
- [ ] Move `services/bernard-agent/src/lib/infra/index.ts`

### Logging Library
- [ ] Move `services/bernard-agent/src/lib/logging/logger.ts`
- [ ] Move `services/bernard-agent/src/lib/logging/context.ts`
- [ ] Move `services/bernard-agent/src/lib/logging/index.ts`

### Utility Files
- [ ] Move `services/bernard-agent/src/lib/string.ts`
- [ ] Move `services/bernard-agent/src/lib/tokenCounter.ts`

## Phase 5: Move Test Files

- [ ] Move `services/bernard-agent/src/lib/plex/media-search.test.ts` → `tests/plex/`
- [ ] Move `services/bernard-agent/src/lib/plex/client.test.ts` → `tests/plex/`
- [ ] Move `services/bernard-agent/src/lib/infra/queue.test.ts` → `tests/infra/`
- [ ] Move `services/bernard-agent/scripts/plex-integration-test.ts` → `scripts/`

## Phase 6: Move Config Files

- [ ] Move `services/bernard-agent/vitest.config.ts`
- [ ] Move `services/bernard-agent/langgraph.json`

## Phase 7: Delete Duplicates (bernard-api)

- [ ] Delete `services/bernard-api/src/lib/logger.ts`
- [ ] Delete `services/bernard-api/src/lib/settingsStore.ts`
- [ ] Delete `services/bernard-api/src/lib/resolveModel.ts`

## Phase 8: Update Import Paths

### Update bernard.agent.ts
- [ ] Update `@/lib/config/settingsCache` → `../../lib/config/settingsCache`
- [ ] Update `@/lib/config/models` → `../../lib/config/models`
- [ ] Update `@/lib/infra/queue` → `../../lib/infra/queue`

### Update tools/ imports (12 files)
- [ ] web-search.tool.ts
- [ ] website-content.tool.ts
- [ ] wikipedia-search.tool.ts
- [ ] wikipedia-entry.tool.ts
- [ ] get-weather-data.tool.ts
- [ ] timer.tool.ts
- [ ] home-assistant-list-entities.tool.ts
- [ ] home-assistant-execute-services.tool.ts
- [ ] home-assistant-toggle-light.tool.ts
- [ ] home-assistant-historical-state.tool.ts
- [ ] search_media.tool.ts
- [ ] play_media_tv.tool.ts

### Update lib/ imports
- [ ] Update all `@/lib/config/*` → `../config/*`
- [ ] Update all `@/lib/home-assistant/*` → `../home-assistant/*`
- [ ] Update all `@/lib/plex/*` → `../plex/*`
- [ ] Update all `@/lib/weather/*` → `../weather/*`
- [ ] Update all `@/lib/website/*` → `../website/*`
- [ ] Update all `@/lib/infra/*` → `../infra/*`
- [ ] Update all `@/lib/logging/*` → `../logging/*`

### Update test imports
- [ ] Update `plex/media-search.test.ts` imports
- [ ] Update `plex/client.test.ts` imports
- [ ] Update `infra/queue.test.ts` imports

## Phase 9: Update package.json

### Add Dependencies
- [ ] Add `@langchain/core`
- [ ] Add `@langchain/langgraph`
- [ ] Add `@langchain/langgraph-checkpoint-redis`
- [ ] Add `@langchain/ollama`
- [ ] Add `@langchain/redis`
- [ ] Add `@mozilla/readability`
- [ ] Add `bullmq`
- [ ] Add `home-assistant-js-websocket`
- [ ] Add `js-tiktoken`
- [ ] Add `jsdom`
- [ ] Add `jsonrepair`
- [ ] Add `plex-api`
- [ ] Add `redis`
- [ ] Add `wikipedia`
- [ ] Add `zod` (upgrade)

### Update Versions
- [ ] Update `pino` to `^10.1.0`
- [ ] Update `pino-pretty` to `^13.1.3`

### Add DevDependencies
- [ ] Add `@types/jsdom`
- [ ] Add `vitest`

### Update Scripts
- [ ] Update `dev` to `npx @langchain/langgraph-cli dev --port 8800`
- [ ] Add `test`: `vitest run`
- [ ] Add `test:watch`: `vitest`
- [ ] Add `test:ui`: `vitest --ui`
- [ ] Add `test:plex`: `npx tsx scripts/plex-integration-test.ts`

## Phase 10: Update Root Scripts

- [ ] Review `scripts/bernard-agent.sh` for any unique commands to preserve
- [ ] Remove `bernard-agent.sh` or mark as deprecated
- [ ] Update `scripts/services.sh` to remove bernard-agent references

## Phase 11: Install Dependencies

- [ ] Run `npm install` in `services/bernard-api/`
- [ ] Verify no install errors

## Phase 12: Verification

### Type Checking
- [ ] Run `npm run type-check`
- [ ] Fix any TypeScript errors

### Testing
- [ ] Run `npm run test`
- [ ] Fix any test failures
- [ ] Verify all moved tests pass

### Building
- [ ] Run `npm run build`
- [ ] Verify successful compilation

### Runtime
- [ ] Run `npm run dev`
- [ ] Verify service starts without errors
- [ ] Verify agent initializes correctly
- [ ] Verify utility worker queue starts

## Phase 13: Cleanup

- [ ] Delete entire `services/bernard-agent/` directory

## Phase 14: Post-Merge Verification

- [ ] Run full test suite
- [ ] Verify all API endpoints still work
- [ ] Verify agent tools are accessible
- [ ] Check logs for any errors

---

## Import Path Reference

### Agent Tools → Lib
```
@/lib/config/XXX → ../../lib/config/XXX
@/lib/home-assistant → ../../lib/home-assistant
@/lib/plex → ../../lib/plex
@/lib/weather → ../../lib/weather
@/lib/website → ../../lib/website
@/lib/infra → ../../lib/infra
@/lib/logging → ../../lib/logging
@/lib/string → ../../lib/string
@/lib/tokenCounter → ../../lib/tokenCounter
```

### Lib → Config
```
@/lib/config/settingsCache → ../config/settingsCache
```

### Lib → Home Assistant
```
@/lib/home-assistant → ../home-assistant
```

### Lib → Plex
```
@/lib/plex → ../plex
```

### Lib → Logging
```
@/lib/logging/logger → ../logging/logger
```

---

## Files Count Summary

| Category | Count |
|----------|-------|
| Agent files | 7 |
| Config lib files | 4 |
| Home Assistant lib files | 7 |
| Plex lib files | 6 |
| Weather lib files | 3 |
| Website lib files | 2 |
| Infra lib files | 5 |
| Logging lib files | 3 |
| Utility files | 2 |
| Test files | 4 |
| Config files | 2 |
| **Total** | **45** |

## Estimated Time

- Preparation: 10 minutes
- File moves: 30 minutes
- Import updates: 60 minutes
- Package.json updates: 15 minutes
- Testing & fixes: 45 minutes
- **Total: ~3 hours**
