# Merge Plan: Bernard-Agent → Bernard-API

## Overview

Merge the contents of `services/bernard-agent/` into `services/bernard-api/` to consolidate all functionality into a single API service that hosts both HTTP endpoints and the LangGraph agent.

## Goals

1. Move all agent code to `bernard-api/src/agents/bernard/`
2. Move all lib code to `bernard-api/src/lib/` (merging with existing)
3. Consolidate and deduplicate utilities (logger, settingsStore, models)
4. Move test infrastructure to `bernard-api/tests/`
5. Move scripts to `bernard-api/scripts/`
6. Update package.json with merged dependencies
7. Remove bernard-agent service entirely

## Directory Structure After Merge

```
services/bernard-api/
├── src/
│   ├── agents/
│   │   └── bernard/
│   │       ├── bernard.agent.ts
│   │       ├── configuration.ts
│   │       ├── state.ts
│   │       ├── updates.ts
│   │       ├── utils.ts
│   │       ├── prompts/
│   │       │   ├── react.prompt.ts
│   │       │   └── response.prompt.ts
│   │       └── tools/
│   │           ├── index.ts
│   │           ├── validation.ts
│   │           ├── types.ts
│   │           ├── web-search.tool.ts
│   │           ├── website-content.tool.ts
│   │           ├── wikipedia-search.tool.ts
│   │           ├── wikipedia-entry.tool.ts
│   │           ├── get-weather-data.tool.ts
│   │           ├── timer.tool.ts
│   │           ├── home-assistant-list-entities.tool.ts
│   │           ├── home-assistant-execute-services.tool.ts
│   │           ├── home-assistant-toggle-light.tool.ts
│   │           ├── home-assistant-historical-state.tool.ts
│   │           ├── search_media.tool.ts
│   │           └── play_media_tv.tool.ts
│   │
│   └── lib/
│       ├── config/
│       │   ├── settingsStore.ts
│       │   ├── settingsCache.ts
│       │   ├── models.ts
│       │   └── index.ts
│       ├── home-assistant/
│       │   ├── websocket-client.ts
│       │   ├── rest-client.ts
│       │   ├── entities.ts
│       │   ├── context.ts
│       │   ├── color-utils.ts
│       │   ├── verification.ts
│       │   └── index.ts
│       ├── plex/
│       │   ├── client.ts
│       │   ├── media-search.ts
│       │   ├── actions.ts
│       │   ├── device-mapping.ts
│       │   ├── plex-api.d.ts
│       │   └── index.ts
│       ├── weather/
│       │   ├── common.ts
│       │   ├── geocoding.ts
│       │   └── index.ts
│       ├── website/
│       │   ├── content-cache.ts
│       │   └── index.ts
│       ├── infra/
│       │   ├── queue.ts
│       │   ├── thread-naming-job.ts
│       │   ├── timeouts.ts
│       │   ├── redis.ts
│       │   └── index.ts
│       ├── logging/
│       │   ├── logger.ts
│       │   ├── context.ts
│       │   └── index.ts
│       ├── string.ts
│       ├── tokenCounter.ts
│       ├── auth.ts
│       ├── oauth.ts
│       ├── taskKeeper.ts
│       └── index.ts
│
├── tests/
│   ├── plex/
│   │   ├── media-search.test.ts
│   │   └── client.test.ts
│   └── infra/
│       └── queue.test.ts
│
├── scripts/
│   └── plex-integration-test.ts
│
├── langgraph.json
├── vitest.config.ts
├── package.json
├── tsconfig.json
└── ...
```

## Files to Move

### Agent Code

| Source | Destination |
|--------|-------------|
| `services/bernard-agent/src/bernard-agent/bernard.agent.ts` | `services/bernard-api/src/agents/bernard/bernard.agent.ts` |
| `services/bernard-agent/src/bernard-agent/configuration.ts` | `services/bernard-api/src/agents/bernard/configuration.ts` |
| `services/bernard-agent/src/bernard-agent/state.ts` | `services/bernard-api/src/agents/bernard/state.ts` |
| `services/bernard-agent/src/bernard-agent/updates.ts` | `services/bernard-api/src/agents/bernard/updates.ts` |
| `services/bernard-agent/src/bernard-agent/utils.ts` | `services/bernard-api/src/agents/bernard/utils.ts` |
| `services/bernard-agent/src/bernard-agent/prompts/*` | `services/bernard-api/src/agents/bernard/prompts/` |
| `services/bernard-agent/src/bernard-agent/tools/*` | `services/bernard-api/src/agents/bernard/tools/` |

### Library Code

| Source | Destination |
|--------|-------------|
| `services/bernard-agent/src/lib/config/*` | `services/bernard-api/src/lib/config/` |
| `services/bernard-agent/src/lib/home-assistant/*` | `services/bernard-api/src/lib/home-assistant/` |
| `services/bernard-agent/src/lib/plex/*` | `services/bernard-api/src/lib/plex/` |
| `services/bernard-agent/src/lib/weather/*` | `services/bernard-api/src/lib/weather/` |
| `services/bernard-agent/src/lib/website/*` | `services/bernard-api/src/lib/website/` |
| `services/bernard-agent/src/lib/infra/*` | `services/bernard-api/src/lib/infra/` |
| `services/bernard-agent/src/lib/logging/*` | `services/bernard-api/src/lib/logging/` |
| `services/bernard-agent/src/lib/string.ts` | `services/bernard-api/src/lib/string.ts` |
| `services/bernard-agent/src/lib/tokenCounter.ts` | `services/bernard-api/src/lib/tokenCounter.ts` |

### Test Files

| Source | Destination |
|--------|-------------|
| `services/bernard-agent/src/lib/plex/media-search.test.ts` | `services/bernard-api/tests/plex/media-search.test.ts` |
| `services/bernard-agent/src/lib/plex/client.test.ts` | `services/bernard-api/tests/plex/client.test.ts` |
| `services/bernard-agent/src/lib/infra/queue.test.ts` | `services/bernard-api/tests/infra/queue.test.ts` |
| `services/bernard-agent/scripts/plex-integration-test.ts` | `services/bernard-api/scripts/plex-integration-test.ts` |

### Config Files

| Source | Destination |
|--------|-------------|
| `services/bernard-agent/vitest.config.ts` | `services/bernard-api/vitest.config.ts` |
| `services/bernard-agent/langgraph.json` | `services/bernard-api/langgraph.json` |

## Files to Delete (Duplicates)

Delete these from `services/bernard-api/` - bernard-agent versions are enhanced:

- `services/bernard-api/src/lib/logger.ts` (use `lib/logging/logger.ts`)
- `services/bernard-api/src/lib/settingsStore.ts` (use `lib/config/settingsStore.ts`)
- `services/bernard-api/src/lib/resolveModel.ts` (use `lib/config/models.ts`)

## Import Path Transformations

All moved files need import paths updated from `@/lib/*` to relative paths:

### Agent Tools Imports
```typescript
// Before
import { getSettings } from "@/lib/config/settingsCache";
import { logger } from "@/lib/logging";
import { getHAConnection } from "@/lib/home-assistant";

// After
import { getSettings } from "../../lib/config/settingsCache";
import { logger } from "../../lib/logging/logger";
import { getHAConnection } from "../../lib/home-assistant";
```

### Agent Internal Imports
```typescript
// Before
import { buildReactSystemPrompt } from "./prompts/react.prompt";
import { validateAndGetTools } from "./tools";

// After
import { buildReactSystemPrompt } from "./prompts/react.prompt";
import { validateAndGetTools } from "./tools/index";
```

### Library Imports Within Libraries
```typescript
// Before
import { getSettings } from "@/lib/config/settingsCache";

// After
import { getSettings } from "../config/settingsCache";
```

## Package.json Changes

### Dependencies to Add
```json
{
  "@langchain/core": "^1.1.8",
  "@langchain/langgraph": "^1.0.7",
  "@langchain/langgraph-checkpoint-redis": "^1.0.1",
  "@langchain/ollama": "^1.1.0",
  "@langchain/redis": "^1.0.1",
  "@mozilla/readability": "^0.5.0",
  "bullmq": "^5.66.0",
  "home-assistant-js-websocket": "^9.6.0",
  "js-tiktoken": "^1.0.15",
  "jsdom": "^27.3.0",
  "jsonrepair": "^3.13.1",
  "plex-api": "^5.3.2",
  "redis": "^4.7.0",
  "wikipedia": "^2.4.2",
  "zod": "^4.3.4"
}
```

### DevDependencies to Add
```json
{
  "@types/jsdom": "^27.0.0",
  "vitest": "^3.0.0"
}
```

### Scripts to Update
```json
{
  "dev": "npx @langchain/langgraph-cli dev --port 8800",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "test:plex": "npx tsx scripts/plex-integration-test.ts"
}
```

### Version Upgrades
```json
{
  "pino": "^10.1.0",
  "pino-pretty": "^13.1.3"
}
```

## Root Scripts Impact

The `/scripts/` directory at the project root remains unchanged. After merge:

- `bernard-agent.sh` → Can be removed (service no longer exists)
- `bernard-api.sh` → Continues to work (now includes agent)
- `services.sh` → Update to remove bernard-agent from service list

## Environment Variables

All environment variables remain in the root `.env` file. No changes needed.

## Entry Point

The main entry point (`services/bernard-api/src/index.ts`) will:
1. Initialize the Fastify HTTP server (existing)
2. Initialize the LangGraph agent (via `createBernardAgent()`)
3. Start the agent's utility worker queue

The dev script `npx @langchain/langgraph-cli dev --port 8800` handles both HTTP server and LangGraph server.

## Files to Remove After Merge

After successful merge, delete the entire `services/bernard-agent/` directory:
```bash
rm -rf services/bernard-agent/
```

## Verification Steps

1. Run `npm run type-check` - no errors
2. Run `npm run test` - all tests pass
3. Run `npm run build` - successful build
4. Run `npm run dev` - service starts without errors
5. Verify agent initialization works
6. Verify all tools validate correctly
