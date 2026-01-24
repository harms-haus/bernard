# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Root-Level Commands (run from repository root)
- `bun run dev` - Start development server (core Next.js app on port 3456)
- `bun run build` - Build core Next.js application
- `bun run start` - Start production server
- `bun run check` - Run full check suite (type-check, lint, test)
- `bun run type-check` - Run TypeScript type checking
- `bun run test` - Run Vitest tests

### Core-Specific Commands (run from `core/` directory)
- `bun run dev` - Start Next.js dev server on port 3456
- `bun run agent:bernard` - Start Bernard LangGraph agent server (port 2024)
- `bun run build` - Build for production
- `bun run lint` - Run ESLint
- `bun run type-check` - TypeScript type checking
- `bun run test` - Run tests once
- `bun run test:watch` - Run tests in watch mode
- `bun run test:coverage` - Run tests with coverage report
- `bun run test:ui` - Run tests with UI

### Service-Specific Commands
- **Whisper.cpp (STT)**: Located at `services/whisper.cpp/` - requires CMake build, runs on port 8870
- **Kokoro (TTS)**: Located at `services/kokoro/` - Python/FastAPI, runs on port 8880, requires model weights download
- **Redis**: Runs on port 6379 via Docker

### Running Individual Tests
```bash
# From core/ directory
bunx vitest run path/to/test.test.ts
bunx vitest run path/to/test.test.ts -t "test name"
```

## Architecture Overview

Bernard is a TypeScript monorepo with an API gateway pattern. The core service (Next.js, port 3456) orchestrates communication between:
- **Bernard Agent** (LangGraph, port 2024) - The main AI agent with 12 tool factories
- **Whisper.cpp** (C++, port 8870) - Speech-to-text service
- **Kokoro** (Python/FastAPI, port 8880) - Text-to-speech service
- **Redis** (port 6379) - Sessions, checkpoints, and BullMQ queues

### Key Directories
- `core/src/agents/` - LangGraph agent definitions (bernard, gertrude)
- `core/src/agents/bernard/tools/` - Tool factories for the Bernard agent
- `core/src/app/api/` - Next.js API routes (OpenAI-compatible endpoints, admin, services)
- `core/src/lib/config/` - Configuration management with Redis-backed settings store
- `core/src/lib/checkpoint/` - Custom Redis checkpoint saver for LangGraph
- `core/src/lib/auth/` - Better-Auth integration with Redis adapter
- `core/src/lib/infra/` - Infrastructure services (Redis, queues, health monitoring)
- `core/src/components/` - React components for dashboard UI

### Agent Architecture

Agents are defined in `core/src/agents/*/` and exported via `core/langgraph.json`. The agent creation pattern:
1. Tools are registered as factory functions in `tools/index.ts`
2. `validateAndGetTools()` validates and returns configured tools based on settings
3. `resolveModel()` resolves model configuration from settings
4. Middleware stack includes: dynamic model, tool call limits (10), retries (model & tool), context editing
5. Checkpoints stored in Redis with custom serializer for typed data

### Model Configuration

Models are configured through an agent-centric runtime settings system stored in Redis:
- **Agent-centric**: Each agent defines its model roles (e.g., `main`, `planner`, `executor`)
- **Utility model**: System-wide model for background tasks like thread naming
- **Agent registry**: `AGENT_MODEL_REGISTRY` in `core/src/lib/config/agentModelRegistry.ts` defines all agents
- **Resolution**: `resolveModel(agentId, roleId)` for agents, `resolveUtilityModel()` for system tasks
- **Providers**: Define `baseUrl`, `apiKey`, and `type` (openai/ollama)

### Settings System

Settings are managed through a multi-layer system:
1. **Environment/Defaults** (`core/src/lib/config/env.ts`) - Base defaults from environment
2. **SettingsManagerCore** (`core/src/lib/config/appSettings.ts`) - File-based settings with JSON schema
3. **SettingsStore** (`core/src/lib/config/settingsStore.ts`) - Redis-backed runtime settings
4. **SettingsCache** (`core/src/lib/config/settingsCache.ts`) - In-memory cache with TTL

Settings include: models, providers, services, OAuth, backups, limits, automations

### API Endpoint Patterns

- `/api/v1/*` - OpenAI-compatible endpoints (chat completions, audio transcriptions, speech)
- `/threads/*`, `/runs/*`, `/assistants/*` - LangGraph SDK proxy endpoints
- `/api/admin/*` - Admin dashboard APIs (models, providers, services, users, backups)
- `/api/services/*` - Service lifecycle management

### Testing

- **Vitest** for unit/integration tests with jsdom environment
- Test files: `*.test.ts` or `*.test.tsx`
- Coverage thresholds: 80% for lines, functions, branches, statements
- Mock tools available in `core/src/agents/bernard/tools/mock/`
- Test utilities in `core/src/agents/bernard/test/utils.ts`

### BullMQ Queues

- **Utility Queue**: Thread auto-renaming jobs
- **Service Action Queue**: Service lifecycle operations (start/stop/restart)
- Job configuration includes exponential backoff, concurrency limits, and cleanup

### Important Patterns

1. **Tool Factories**: Tools are factory functions that receive dependencies (settings, HTTP clients) for testability
2. **Lazy Initialization**: Agents, Redis connections, and services use lazy initialization patterns
3. **Dependency Injection**: Core services use constructor injection for testability
4. **Streaming**: Most operations support streaming responses (chat, audio transcription, TTS)
5. **Health Monitoring**: Background process checks service health at configured intervals
6. **Progress Reporting**: Tools can report progress during long-running operations

### Environment Configuration

- `core/langgraph.json` defines agent graphs and references `.env`
- Runtime: Bun v1.3.6+
- TypeScript strict mode enabled
- Path alias: `@/*` maps to `core/src/*`

### TypeScript Path Resolution

When running scripts from root, be aware that imports use `@/*` alias which resolves to `core/src/*`. The tsconfig uses `moduleResolution: "bundler"` for Next.js compatibility.
