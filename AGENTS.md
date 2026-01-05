# Bernard Repository Architecture Guide

> **NOTE TO FUTURE AGENTS**: This document describes the Bernard architecture. Read before modifying. Key commands are in the [Development Commands](#development-commands) section.

## Overview

Bernard is a family voice assistant built with LangGraph that provides an OpenAI-compatible API for intelligent conversational assistance. The system is a microservices architecture with services written in TypeScript, Python, and C++.

## Filesystem Layout

```
/
├── start.sh                    # Entry point - delegates to services.sh
├── scripts/                    # Service orchestration scripts
│   ├── services.sh            # Main orchestrator (start, stop, init, clean, check)
│   ├── shared.sh              # Builds lib/shared
│   ├── redis.sh               # Redis with RediSearch container
│   ├── bernard-agent.sh       # CORE: LangGraph agent service (port 2024)
│   ├── bernard-api.sh         # Configuration & auth API
│   ├── bernard-ui.sh          # React admin UI
│   ├── proxy-api.sh           # Unified gateway (OAuth + routing)
│   ├── vllm.sh                # Embedding service (port 8860)
│   ├── whisper.sh             # Speech-to-text (port 8870)
│   ├── kokoro.sh              # Text-to-speech (port 8880)
│   └── logging.sh             # Common logging utilities
├── lib/shared/                # Shared TypeScript library (built first)
├── proxy-api/                 # Fastify gateway (port 3456)
└── services/
    ├── bernard-agent/         # CORE: LangGraph agent service (port 2024)
    ├── bernard-api/           # Settings, auth, token management (port 8800)
    ├── bernard-ui/            # React admin dashboard (served via proxy)
    ├── kokoro/                # FastAPI TTS service (Python, port 8880)
    └── whisper.cpp/           # C++ speech recognition (port 8002)
```


**Note**: `function-gamma` and `ingress` directories are excluded from this documentation.

---

## Core Service: Bernard Agent (`services/bernard-agent/`)

Bernard Agent is the heart of the repository—a LangGraph-based agent system.

### Architecture

```
src/agent/
├── graph/
│   ├── bernard.graph.ts       # Main voice assistant workflow
│   ├── text-chat.graph.ts     # Text chat variant
│   ├── state.ts               # LangGraph state definition
│   └── toolNode.ts            # Tool execution node
├── routing.agent.ts           # "Data Coordinator" - decides which tools to call
├── response.agent.ts          # "Creative Assistant" - generates final responses
├── llm/
│   ├── factory.ts             # LLM provider factory (OpenAI, Ollama)
│   ├── chatOpenAI.ts          # OpenAI implementation
│   └── chatOllama.ts          # Ollama implementation
├── tool/
│   ├── index.ts               # Tool registry
│   ├── web-search.tool.ts     # SearXNG integration
│   ├── wikipedia-*.tool.ts    # Wikipedia search/entry
│   ├── home-assistant-*.tool.ts # HA entity control, state, services
│   ├── weather.tool.ts        # Weather data
│   └── timer.tool.ts          # Timer functionality
└── node/
    └── recollection.node.ts   # Memory retrieval

lib/
├── config/                    # Settings management (Redis-backed)
├── auth/                      # Authentication & tokens
├── openai.ts                  # OpenAI API compatibility layer
├── home-assistant/            # HA WebSocket + REST integration
├── automation/                # Background task system (BullMQ)
├── plex/                      # Media server integration
└── tracing/                   # Request tracing & logging
```

### Graph Flow

```
START → recollection → routing_agent → (tool_node | response_agent) → END
                                        ↑___________|
```

- **Recollection**: Retrieves relevant memories from memory system
- **Routing Agent**: Analyzes queries, decides which tools to call (max 10 iterations)
- **Tool Node**: Executes tools in parallel with error handling
- **Response Agent**: Generates final natural language response

### State Schema (`state.ts`)

```typescript
BernardState {
  messages: MessagesAnnotation       // Conversation history
  memories: string[]                 // Retrieved context memories
  toolResults: Record<string, string> // Cached tool results
  status: string                     // Current workflow state
  iterationCount: number             // Prevents infinite loops
}
```

### Tool System

Tools are LangChain `StructuredTool` implementations. Available tools:
- Web search (SearXNG)
- Wikipedia search & entry retrieval
- Weather data
- Home Assistant (lights, entities, services, historical state)
- Plex media control
- Timer functionality
- Task recall system
- Website content extraction

### Server Entry Point (`server.ts`)

OpenAI-compatible HTTP server on port 8850:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completions (streaming or blocking) |

Supports CORS, streaming responses, graceful shutdown, and request tracing.

### Configuration

Settings stored in Redis, configurable via:
- Environment variables (`.env`)
- Bernard API admin endpoints
- Bernard UI dashboard

---

## Other Services

### Bernard API (`services/bernard-api/`)
- **Port**: 8800
- **Purpose**: Central configuration, authentication, token management, request logging
- **Tech**: Fastify, Redis
- **Entry**: `src/index.ts`

### Bernard UI (`services/bernard-ui/`)
- **Port**: 8810 (served via proxy)
- **Purpose**: React admin dashboard, chat interface, settings management
- **Tech**: React 18, Radix UI, Tailwind CSS, Vite

### Proxy API (`proxy-api/`)
- **Port**: 3456
- **Purpose**: Unified gateway with OAuth authentication and service routing
- **Tech**: Fastify, Node.js
- **Entry**: `src/index.ts`
- **Routes**: `/api/*` → Bernard API, `/v1/*` → Bernard, `/bernard/*` → UI

### Kokoro TTS (`services/kokoro/`)
- **Port**: 8880
- **Purpose**: Text-to-speech with OpenAI-compatible `/v1/audio/speech`
- **Tech**: Python, FastAPI, PyTorch, Kokoro model (80+ voices)

### Whisper.cpp (`services/whisper.cpp/`)
- **Port**: 8002 (HTTP server mode)
- **Purpose**: High-performance speech recognition
- **Tech**: C++, CMake, whisper models (ggml format)
- **Platform**: CUDA/Metal/Vulkan/OpenVINO support

### VLLM (`services/vllm/`)
- **Port**: 8860
- **Purpose**: Embedding service (Nomic model)
- **Tech**: Python, vLLM inference engine

---

## Service Startup Orchestration

### Startup Order (Dependency-Aware)

```
1. SHARED        → Builds lib/shared (no port)
2. REDIS         → Port 6379 (required by all services)
3. BERNARD-API   → Port 8800 (auth, settings)
4. PROXY-API     → Port 3456 (gateway, requires API)
5. BERNARD-AGENT → Port 2024 (core agent, requires Redis)
6. BERNARD-UI    → Port 8810 (static, served via proxy)
7. VLLM          → Port 8860 (embeddings)
8. WHISPER       → Port 8870 (ASR)
9. KOKORO        → Port 8880 (TTS)
```

### Commands (`./scripts/services.sh`)

| Command | Description |
|---------|-------------|
| `./start.sh` | Start all services with health checks |
| `./start.sh --exit-after-start` | Start services, exit immediately (daemon mode) |
| `./scripts/services.sh stop` | Stop all services gracefully |
| `./scripts/services.sh init` | Install dependencies for all services |
| `./scripts/services.sh clean` | Remove all build artifacts |
| `./scripts/services.sh check` | Run validation on all services |

### Health Checks

Each service script implements:
- `start` with timeout (20s default, configurable)
- Health check via `/health` endpoint
- Parallel verification after all services start
- Detailed error logging on failure

### Example Service Script Pattern

```bash
#!/bin/bash
source "$(dirname "$0")/logging.sh"

SERVICE_NAME="BERNARD"
COLOR="\033[0;32m"
NC="\033[0m"

start() {
    log "Starting $SERVICE_NAME..."
    # Health check loop
    # Log tailing
}

stop() {
    log "Stopping $SERVICE_NAME..."
    # Graceful shutdown + force kill
}

check() {
    # Run: type-check → lint → build
    # Track pass/fail for each step
}

case "$1" in
    start) start ;;
    stop) stop ;;
    check) check ;;
esac
```

---

## Development Commands

### Bernard Core (`services/bernard-agent/`)

```bash
cd services/bernard-agent

npm run lint          # ESLint with TypeScript rules
npm run type-check    # TypeScript compiler (tsc --noEmit)
npm run type-check:src # Type check excluding tests
npm run build         # Vite build for production
npm run tests         # Vitest test runner
npm run tests:watch   # Watch mode
npm run tests:coverage # With v8 coverage
npm run dev           # tsx watch server
```

### Bernard UI (`services/bernard-ui/`)

```bash
cd services/bernard-ui

npm run lint
npm run type-check
npm run build         # tsc && vite build
npm run dev           # Vite dev server
```

### Bernard API (`services/bernard-api/`)

```bash
cd services/bernard-api

npm run lint
npm run type-check
npm run build         # TypeScript compilation
npm run dev           # tsx watch
```

### Proxy API (`proxy-api/`)

```bash
cd proxy-api

npm run lint
npm run type-check
npm run build
npm run dev
```

### Kokoro TTS (`services/kokoro/`)

```bash
cd services/kokoro

pytest                    # Run tests
pytest --cov=api --cov=ui # With coverage
uv run pytest            # Via uv package manager
```

### Whisper.cpp (`services/whisper.cpp/`)

```bash
cd services/whisper.cpp

make build   # CMake build
make clean   # Remove artifacts
make tiny.en # Build with specific model
```

### Service-Level Check

```bash
# Full validation for a service
./scripts/bernard.sh check
./scripts/bernard-api.sh check
# etc.

# Check all services
./scripts/services.sh check
```

---

## Common Patterns

### Adding a New Tool

1. Create `src/agent/tool/my-tool.tool.ts`:
   ```typescript
   import { StructuredTool } from "@langchain/core/tools";
   
   export const myTool = new StructuredTool({
     name: "my_tool",
     description: "Does something useful",
     parameters: z.object({ ... }),
     handler: async (input) => { ... }
   });
   ```

2. Register in `src/agent/tool/index.ts`

3. Add to tool registry in graph construction

### Adding a New Service

1. Create `scripts/new-service.sh` with standard pattern (start/stop/check)
2. Add to `services.sh` startup order and service arrays
3. Create health check endpoint at `/health`
4. Document in this file

### Modifying Configuration

Settings are Redis-backed. Modify via:
1. Bernard UI dashboard (easiest)
2. Bernard API admin endpoints
3. Direct Redis writes (advanced)

---

## Key Files for Reference

| File | Purpose |
|------|---------|
| `services/bernard-agent/src/bernard-agent/graph.ts` | LangGraph workflow definition |
| `services/bernard-agent/src/bernard-agent/state.ts` | State schema for graph |
| `services/bernard-agent/src/bernard-agent/tools/index.ts` | Tool registry |
| `scripts/services.sh` | Service orchestration master script |
| `services/bernard-agent/package.json` | Dependencies, scripts, lint config |

---

## Debugging Tips

- **Logs**: All services log to `logs/{service}.log`
- **Tail all logs**: `./scripts/services.sh start` (monitors in foreground)
- **Check service health**: `curl http://localhost:{port}/health`
- **Redis**: `redis-cli -p 6379` for session/state inspection
- **Build failures**: Check `logs/{service}-check.log` and `logs/{service}-check.status`

---

## Ignore List

The following directories are excluded from this documentation and should be ignored:
- `function-gemma`
- `ingress`

For questions about architecture decisions, consult the `docs/` directory.
