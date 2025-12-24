---
name: Reorganize Tools Tasks Utilities
overview: Reorganize the codebase to create a shared utility space between tools and tasks, move tools and tasks to agent/ level, extract utilities into domain-based files in lib/utility/, and update all references.
todos:
  - id: create-directories
    content: "Create new directory structure: agent/tool/, agent/task/, lib/ with domain subdirectories"
    status: pending
  - id: extract-ha-utilities
    content: Move Home Assistant utilities to lib/home-assistant/ and create index.ts
    status: pending
    dependencies:
      - create-directories
  - id: extract-plex-utilities
    content: Move plex-device-mapping.ts and extract Plex API functions from play_media_tv.ts into lib/plex/
    status: pending
    dependencies:
      - create-directories
  - id: extract-weather-utilities
    content: Move weather-common.ts and split geocoding into lib/weather/
    status: pending
    dependencies:
      - create-directories
  - id: extract-website-utilities
    content: Move website-content-cache.ts to lib/website/
    status: pending
    dependencies:
      - create-directories
  - id: move-tools
    content: Move all tool files from agent/harness/router/tools/ to agent/tool/ and update imports
    status: pending
    dependencies:
      - extract-ha-utilities
      - extract-plex-utilities
      - extract-weather-utilities
      - extract-website-utilities
  - id: move-tasks
    content: Move play_media_tv.ts to agent/task/play_media_tv.task.ts and update to use extracted utilities
    status: pending
    dependencies:
      - extract-plex-utilities
  - id: move-recordkeepers
    content: Move recordKeeper files to agent/ level and update all imports
    status: pending
  - id: update-imports
    content: "Update all imports across codebase: routerHarness.ts, orchestrator.ts, executor.ts, API routes, tests"
    status: pending
    dependencies:
      - move-tools
      - move-tasks
      - move-recordkeepers
  - id: update-tests
    content: Reorganize and update test files, create new utility tests
    status: pending
    dependencies:
      - update-imports
  - id: cleanup
    content: Remove old directories and update documentation
    status: pending
    dependencies:
      - update-tests
---

# Reo

rganize Tools, Tasks, and Utilities Structure

## Overview

Reorganize the codebase to create a shared utility space accessible to both tools and tasks, eliminating deep nested imports and improving code organization.

## Current Structure Analysis

**Current Issues:**

- Tools are in `bernard/agent/harness/router/tools/` with utilities deeply nested in `tools/utility/`
- Tasks are in `lib/task/functions/` and must import utilities via `../agent/harness/router/tools/utility/`
- Utilities are mixed by domain but could be better organized
- RecordKeepers are in `lib/conversation/` and `lib/task/` but should be at agent level

**Utilities Found:**

- Home Assistant: `home-assistant-websocket-client.ts`, `home-assistant-rest-client.ts`, `home-assistant-entities.ts`, `home-assistant-context.ts`, `home-assistant-color-utils.ts`
- Plex: `plex-device-mapping.ts`
- Weather: `weather-common.ts` (large file, ~595 lines)
- Website: `website-content-cache.ts`

## Target Structure

```javascript
bernard/
  agent/
    tool/
      play_media_tv.tool.ts
      web-search.tool.ts
      get-weather-data.tool.ts
      website-content.tool.ts
      home-assistant-*.tool.ts
      recall*.tool.ts
      timer.tool.ts
      geocode.tool.ts
      wikipedia-*.tool.ts
      index.ts
    harness/
      router/
        routerHarness.ts
        prompts.ts
      respond/
      recollect/
    task/
      play_media_tv.task.ts
    orchestrator.ts
    recordKeeper.conversation.ts
    recordKeeper.task.ts
  lib/
      home-assistant/
        websocket-client.ts
        rest-client.ts
        entities.ts
        context.ts
        color-utils.ts
        index.ts
      plex/
        device-mapping.ts
        media-search.ts
        index.ts
      weather/
        common.ts
        geocoding.ts
        index.ts
      website/
        content-cache.ts
        index.ts
```



## Implementation Steps

### Phase 1: Create New Directory Structure

1. Create `bernard/agent/tool/` directory
2. Create `bernard/agent/task/` directory  
3. Create `bernard/lib/` with domain subdirectories:

- `home-assistant/`
- `plex/`
- `weather/`
- `website/`

### Phase 2: Extract and Reorganize Utilities

**Home Assistant Utilities** (`lib/home-assistant/`):

- Move `home-assistant-websocket-client.ts` → `websocket-client.ts`
- Move `home-assistant-rest-client.ts` → `rest-client.ts`
- Move `home-assistant-entities.ts` → `entities.ts`
- Move `home-assistant-context.ts` → `context.ts`
- Move `home-assistant-color-utils.ts` → `color-utils.ts`
- Create `index.ts` to export all utilities

**Plex Utilities** (`lib/plex/`):

- Move `plex-device-mapping.ts` → `device-mapping.ts`
- Extract Plex API functions from `play_media_tv.ts` task into `media-search.ts`:
- `searchPlexMedia()`
- `getPlexLibrarySections()`
- `getPlexItemMetadata()`
- `rankSearchResults()`
- `searchPlexBestMatch()`
- `getPlexServerIdentity()`
- `discoverPlexClient()`
- Create `index.ts` to export all utilities

**Weather Utilities** (`lib/weather/`):

- Move `weather-common.ts` → `common.ts`
- Extract geocoding functions from `weather-common.ts` into `geocoding.ts`:
- `geocodeLocation()`
- Related geocoding types and helpers
- Create `index.ts` to export all utilities

**Website Utilities** (`lib/website/`):

- Move `website-content-cache.ts` → `content-cache.ts`
- Create `index.ts` to export utilities

### Phase 3: Move Tools

Move all tool files from `bernard/agent/harness/router/tools/` to `bernard/agent/tool/`:

- `play_media_tv.tool.ts`
- `web-search.tool.ts`
- `get-weather-data.tool.ts`
- `website-content.tool.ts`
- `home-assistant-*.tool.ts` (all 5 files)
- `recall*.tool.ts` (3 files)
- `timer.tool.ts`
- `geocode.tool.ts`
- `wikipedia-*.tool.ts` (2 files)
- `index.ts` (update imports)

### Phase 4: Move Tasks

1. Move `lib/task/functions/play_media_tv.ts` → `agent/task/play_media_tv.task.ts`
2. Extract shared Plex utilities from task into `lib/plex/media-search.ts`
3. Update task to use extracted utilities

### Phase 5: Move RecordKeepers

1. Move `lib/conversation/recordKeeper.ts` → `agent/recordKeeper.conversation.ts`
2. Move `lib/task/recordKeeper.ts` → `agent/recordKeeper.task.ts`
3. Update all imports

### Phase 6: Update All Imports

**Tool imports:**

- Update all tools to import from `@/lib/` instead of `./utility/`
- Update `agent/tool/index.ts` to export tools correctly

**Task imports:**

- Update `play_media_tv.task.ts` to import from `@/lib/`
- Update `lib/task/executor.ts` to import task from `@/agent/task/`

**Router harness imports:**

- Update `routerHarness.ts` to import tools from `@/agent/tool/`
- Update `orchestrator.ts` to import recordKeepers from `@/agent/`

**Other files:**

- Update all files importing from old paths:
- `orchestrator.ts`
- `home-assistant-get-entity-state.tool.ts` (if it becomes a tool)
- Any API routes using tools
- Test files

### Phase 7: Update Tests

1. Move/create utility tests:

- `tests/home-assistant/` - Test HA utilities
- `tests/plex/` - Test Plex utilities  
- `tests/weather/` - Test weather utilities
- `tests/website/` - Test website utilities

2. Update existing tests:

- `tests/recordKeeper.test.ts` - Update import path
- `tests/orchestrator.test.ts` - Update import paths
- Any tool-specific tests

3. Create new tests for utilities:

- Test Plex media search functions
- Test HA WebSocket connection pooling
- Test weather geocoding
- Test device mapping functions

### Phase 8: Cleanup

1. Remove old directories:

- `bernard/agent/harness/router/tools/utility/`
- `bernard/lib/task/functions/` (if empty)

2. Update documentation:

- Update `AGENTS.md` with new structure
- Update any architecture docs referencing old paths

## Key Files to Modify

**High-impact files:**

- `bernard/agent/harness/router/routerHarness.ts` - Tool imports
- `bernard/agent/loop/orchestrator.ts` - RecordKeeper imports, tool imports
- `bernard/lib/task/executor.ts` - Task imports
- `lib/task/functions/play_media_tv.ts` - Extract utilities, update imports

**Utility extraction:**

- Extract ~200 lines of Plex API code from `play_media_tv.ts` into `lib/plex/media-search.ts`
- Split `weather-common.ts` (~595 lines) into `common.ts` and `geocoding.ts`

## Migration Strategy

1. Create new structure first (empty directories)
2. Move utilities with updated imports
3. Move tools with updated imports  
4. Move tasks with updated imports
5. Move recordKeepers with updated imports
6. Update all consuming code
7. Run tests and fix import errors
8. Remove old directories

## Testing Strategy

- Run existing tests after each phase
- Create utility tests before moving code (TDD approach)
- Verify no circular dependencies
- Check that all imports resolve correctly
- Ensure TypeScript compilation succeeds

## Notes

- Use `@/lib/` import alias for utilities (already configured in tsconfig)
- Keep backward compatibility during migration if possible