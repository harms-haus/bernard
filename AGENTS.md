# Bernard Services

> **WARNING**: Bernard is a defunct, legacy project. This document exists for historical reference and should not be actively maintained or extended. If you need to work with Bernard, treat it as read-only reference material. Do not add new features, refactor existing code, or make significant changes. Use this as a guide to understand the architecture only.

This document describes the services supported by Bernard, an AI assistant platform. Bernard consists of multiple microservices that work together to provide conversational AI capabilities with speech-to-text, LLM inference, and text-to-speech functionality.

## Table of Contents

- [bernard-agent](#bernard-agent)
- [proxy-api](#proxy-api)
- [bernard-api](#bernard-api)
- [bernard-ui](#bernard-ui)
- [whisper](#whisper)
- [vllm](#vllm)
- [kokoro](#kokoro)

---

## bernard-agent

**Port**: 2024  
**Directory**: `services/bernard-agent`  
**Type**: LangGraph-based agent service

The core agent service powered by LangGraph for orchestrating multi-step conversational workflows.

### Available Commands

```bash
# Check code quality (type-check, lint, build)
./scripts/bernard-agent.sh check

# Install dependencies
./scripts/bernard-agent.sh init

# Clean build artifacts and node_modules
./scripts/bernard-agent.sh clean

# Start the agent service
./scripts/bernard-agent.sh start

# Stop the agent service
./scripts/bernard-agent.sh stop
```

### NPM Scripts (from package.json)

```bash
# Type-check only
npm run type-check

# Lint source code
npm run lint

# Build TypeScript
npm run build

# Start development server with hot reload
npm run dev
```

---

## proxy-api

**Port**: 3456  
**Directory**: `proxy-api`  
**Type**: Fastify unified server

A unified Fastify server providing OAuth authentication, API proxying, and service integration. This is the main entry point for the Bernard UI.

### Available Commands

```bash
# Check code quality (type-check, lint, build)
./scripts/proxy-api.sh check

# Install dependencies
./scripts/proxy-api.sh init

# Clean build artifacts and node_modules
./scripts/proxy-api.sh clean

# Start the proxy API
./scripts/proxy-api.sh start

# Stop the proxy API
./scripts/proxy-api.sh stop
```

### NPM Scripts (from package.json)

```bash
# Type-check only
npm run type-check

# Lint source code
npm run lint

# Build TypeScript
npm run build

# Start development server with hot reload
npm run dev

# Build and start production server
npm run build && npm run start

# Start Whisper service only
npm run dev:whisper
```

---

## bernard-api

**Port**: 8800  
**Directory**: `services/bernard-api`  
**Type**: Fastify API service

Central API service for Bernard handling settings, authentication, and request logging.

### Available Commands

```bash
# Check code quality (type-check, lint, build)
./scripts/bernard-api.sh check

# Install dependencies
./scripts/bernard-api.sh init

# Clean build artifacts and node_modules
./scripts/bernard-api.sh clean

# Start the API service
./scripts/bernard-api.sh start

# Stop the API service
./scripts/bernard-api.sh stop
```

### NPM Scripts (from package.json)

```bash
# Type-check only
npm run type-check

# Lint source code
npm run lint

# Build TypeScript
npm run build

# Start development server with hot reload
npm run dev

# Build and start production server
npm run build && npm run start
```

---

## bernard-ui

**Port**: 8810  
**Directory**: `services/bernard-ui`  
**Type**: React/Vite frontend application

The Bernard web interface built with React, Vite, and Radix UI components.

### Available Commands

```bash
# Check code quality (type-check, lint, build)
./scripts/bernard-ui.sh check

# Install dependencies
./scripts/bernard-ui.sh init

# Clean build artifacts and node_modules
./scripts/bernard-ui.sh clean

# Start the UI development server
./scripts/bernard-ui.sh start

# Stop the UI development server
./scripts/bernard-ui.sh stop
```

### NPM Scripts (from package.json)

```bash
# Type-check only
npm run type-check

# Lint source code
npm run lint

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run tests
npm run tests

# Run tests in watch mode
npm run tests:watch

# Run tests with coverage
npm run tests:coverage

# Start development server with hot reload
npm run dev
```

---

## whisper

**Port**: 8870  
**Directory**: `services/whisper.cpp`  
**Type**: Whisper.cpp speech-to-text service

Whisper.cpp-based speech recognition service for audio transcription.

### Available Commands

```bash
# Check binary and model availability
./scripts/whisper.sh check

# Initialize whisper.cpp and download model
./scripts/whisper.sh init

# Clean build artifacts
./scripts/whisper.sh clean

# Start whisper server
./scripts/whisper.sh start

# Stop whisper server
./scripts/whisper.sh stop
```

### Initialization Details

The `init` command:
- Clones whisper.cpp repository if not present
- Builds whisper-server with CMake (with CUDA support)
- Downloads the small Whisper model to `models/whisper/ggml-small.bin`

### Binary and Model Requirements

- Binary: `services/whisper.cpp/build/bin/whisper-server`
- Model: `models/whisper/ggml-small.bin`

---

## vllm

**Port**: 8860  
**Directory**: `services/vllm`  
**Type**: vLLM embedding service

vLLM-based embedding service running the nomic-embed-text-v1.5 model for text embeddings.

### Available Commands

```bash
# Check venv and model availability
./scripts/vllm.sh check

# Initialize virtual environment and install vllm
./scripts/vllm.sh init

# Clean (no-op for this service)
./scripts/vllm.sh clean

# Start vLLM server
./scripts/vllm.sh start

# Stop vLLM server
./scripts/vllm.sh stop
```

### Initialization Details

The `init` command:
- Creates Python 3.11 virtual environment at `services/vllm/.venv`
- Installs vllm, transformers, and torch
- Downloads nomic-embed-text-v1.5 model to HuggingFace cache

### Health Check

GPU memory is automatically detected. If nvidia-smi is available, GPU memory utilization is calculated as `max(0.3 * 1024 / total_mem_mib, 0.05)`.

---

## kokoro

**Port**: 8880  
**Directory**: `services/kokoro`  
**Type**: Kokoro TTS service

Kokoro-FastAPI text-to-speech service for voice synthesis.

### Available Commands

```bash
# Health check (no-op)
./scripts/kokoro.sh check

# Initialize Kokoro and download model
./scripts/kokoro.sh init

# Clean (no-op for this service)
./scripts/kokoro.sh clean

# Start Kokoro TTS server
./scripts/kokoro.sh start

# Stop Kokoro TTS server
./scripts/kokoro.sh stop
```

### Initialization Details

The `init` command:
- Clones Kokoro-FastAPI repository if not present
- Creates Python virtual environment with uv
- Installs Kokoro with torch
- Downloads Kokoro model to `services/kokoro/api/src/models/v1_0`

### Environment Variables

The service requires:
- `PYTHONPATH`: Points to `$DIR:$DIR/api`
- `MODEL_DIR`: Model files location
- `VOICES_DIR`: Voice files location
- `ESPEAK_DATA_PATH`: eSpeak NG data path (default: `/usr/lib/x86_64-linux-gnu/espeak-ng-data`)

---

## Orchestration

### Master Services Script

Use `scripts/services.sh` to manage all services at once:

```bash
# Check all services
./scripts/services.sh check

# Initialize all services
./scripts/services.sh init

# Clean all services
./scripts/services.sh clean

# Start all services
./scripts/services.sh start

# Start all services and exit immediately (services run in background)
./scripts/services.sh start --exit-after-start

# Stop all services
./scripts/services.sh stop
```

### Service Startup Order

Services are started in the following order:

1. Redis (port 6379)
2. Shared library build
3. Bernard-API (port 8800)
4. Proxy-API (port 3456)
5. Bernard-Agent (port 2024)
6. Bernard-UI (port 8810)
7. VLLM (port 8860)
8. Whisper (port 8870)
9. Kokoro (port 8880)

### Log Files

All service logs are stored in the `logs/` directory:

- `logs/bernard-agent.log`
- `logs/proxy.log`
- `logs/bernard-api.log`
- `logs/bernard-ui.log`
- `logs/vllm-embeddings.log`
- `logs/whisper.log`
- `logs/kokoro.log`
- `logs/redis.log`

### Tail All Logs

```bash
# Monitor all service logs in real-time
./scripts/services.sh
```

Press Ctrl+C to stop all services.

---

## Environment Variables

All services load configuration from the root `.env` file. Key variables include:

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection URL |
| `TZ` | Timezone for timestamp formatting |
| `HF_HOME` | HuggingFace cache directory |
| `PYTHONPATH` | Python module search path (for Kokoro) |

### OAuth Configuration (for proxy-api)

```env
OAUTH_GITHUB_CLIENT_ID=your-client-id
OAUTH_GITHUB_CLIENT_SECRET=your-client-secret
ADMIN_API_KEY=your-secure-admin-token
```

---

## Dependencies

- **Node.js**: TypeScript services require Node.js with npm
- **Python 3.11**: For vLLM and Kokoro services
- **uv**: Python package manager (for Kokoro)
- **CMake**: For building whisper.cpp
- **CUDA**: Optional, for GPU-accelerated Whisper inference
- **Redis**: Required for all services

