# Bernard - AI Agent Platform

Bernard is a production-grade AI agent platform built as a TypeScript monorepo. It combines a LangGraph-powered agent, an OpenAI-compatible API gateway, and integrated speech services into a cohesive system designed for home automation and intelligent assistance.

## Architecture Overview

The platform follows an API gateway pattern where a Next.js core service (port 3456) orchestrates communication between specialized services. The architecture separates concerns cleanly: the agent handles intelligent reasoning, the API layer provides external compatibility, and dedicated services handle compute-intensive speech processing.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│   (Web UI, API Clients, Voice Assistants, Custom Integrations)  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Core API Gateway (Next.js, port 3456)                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  • OpenAI-compatible /v1/* endpoints                      │  │
│  │  • LangGraph SDK proxy (/threads, /runs, /assistants)    │  │
│  │  • Admin dashboard API (/bernard/admin/*)                │  │
│  │  • Session-based authentication (Better-Auth)            │  │
│  │  • Service health monitoring & management                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────┬─────────────────────┬─────────────────┬───────────┘
              │                     │                 │
              ▼                     ▼                 ▼
┌──────────────────┐  ┌────────────────────┐  ┌────────────────┐
│ Bernard Agent    │  │ Whisper.cpp        │  │ Kokoro TTS     │
│ (LangGraph,      │  │ (C++ STT,          │  │ (Python/FastAPI│
│  port 2024)      │  │  port 8870)        │  │  port 8880)    │
│                  │  │                    │  │                │
│ • 12 tool factories│  │ • OpenAI-compatible │  │ • OpenAI speech│
│ • Redis checkpoints│  │   /inference endpoint│  │   endpoint     │
│ • Progress reporting│ │ • Streaming support  │  │ • 35-100x RT   │
│ • Model middleware │  │ • VAD-based segment  │  │ • Voice mixing │
└──────────────────┘  └────────────────────┘  └────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Redis Stack Server (port 6379)                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │ Session Storage│  │ BullMQ Queues │  │ LangGraph        │   │
│  │ (Better-Auth)  │  │ (Utility Jobs)│  │ Checkpoints      │   │
│  └────────────────┘  └────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Service

The core service is a Next.js application running on port 3456. It serves as the single entry point for all client interactions, handling authentication, request routing, and service orchestration.

### API Endpoints

The core exposes three distinct API patterns. First, the OpenAI-compatible endpoints at `/api/v1/*` provide direct compatibility with OpenAI SDKs and tools. These endpoints proxy requests to downstream services based on the endpoint type: chat completions route to the Bernard agent, audio transcription to whisper.cpp, and speech synthesis to kokoro.

Second, the LangGraph SDK endpoints at `/threads/*`, `/runs/*`, and `/assistants/*` provide direct access to the agent's conversation management system. These endpoints are reverse-proxied to the Bernard agent service, enabling the official LangGraph SDK to function without modification.

Third, the admin and management endpoints at `/api/admin/*`, `/api/services/*`, and `/api/users/*` power the web dashboard and provide service lifecycle management capabilities.

### Authentication System

Authentication is implemented using Better-Auth with a custom Redis adapter. Sessions are stored in Redis with configurable TTL, supporting both email/password credentials and OAuth providers (GitHub, Google). The system provides role-based access control with an admin role for elevated permissions.

### Service Configuration

All services are defined centrally in `ServiceConfig.ts` with their ports, health check endpoints, startup commands, and dependencies. The service manager handles lifecycle operations including startup sequencing based on dependencies (Redis starts first, then core services), health checking with configurable timeouts, and process management with stdio piping for log aggregation.

## Bernard Agent

The Bernard agent is a LangGraph-powered intelligent assistant running on port 2024. It uses a structured reasoning approach with tool-augmented capabilities for home automation, media management, and information retrieval.

### Tool Ecosystem

The agent has twelve tool factories organized into four categories. The information retrieval tools include web search via SearXNG, Wikipedia search and article retrieval, and website content extraction using Readability.js. The home automation tools integrate with Home Assistant through WebSocket and REST APIs, supporting entity listing, service execution, light control with brightness and color, and historical state queries.

The media management tools connect to Overseerr for media requests, allowing the agent to search for media availability, submit requests, list pending requests, cancel requests, and report issues. Additional media tools integrate with Plex for playback control on TV devices, including power management, application launching, and playback resumption.

A timer tool enables scheduled operations within conversations using the agent's built-in timer functionality.

### Agent Architecture

The agent uses LangGraph's createAgent with several middleware components. A dynamic model middleware enables runtime model selection and configuration. A tool call limit middleware restricts the agent to ten tool calls per turn, preventing runaway execution. Retry middleware implements exponential backoff for both tool calls and model invocations. Context editing middleware manages conversation history, clearing old messages while preserving the most recent context.

Checkpoints are stored in Redis using a custom serializer that properly handles typed data, enabling conversation resumption and state recovery across restarts.

### State Management

The agent maintains a messages-based state with a standard reducer for handling conversation turns. Progress reporting tools provide real-time feedback during long-running operations, updating users on search progress, reading status, and processing steps.

## Frontend Dashboard

The web interface is a React application built with Next.js and Tailwind CSS. It provides a complete user experience for interacting with the agent and managing the platform.

### Chat Interface

The chat interface provides a modern conversational experience with streaming responses, tool call visualization, and conversation history management. Messages display in a threaded view with distinct styles for human and AI messages. Tool calls show as expandable sections with progress indicators, revealing results when complete.

Conversation threads are managed through the LangGraph SDK, supporting creation, renaming, deletion, and historical navigation. A sidebar provides quick access to previous conversations, and auto-renaming automatically generates descriptive thread titles based on the first message exchange.

### Admin Panel

The admin section provides system administration capabilities through a sidebar navigation. The Status dashboard shows real-time service health, uptime, and operational status for all services. The Services page allows service lifecycle management with start, stop, and restart operations, plus log streaming for debugging. The Models page displays available language models and their configurations. The Users page provides user management with role assignment and status monitoring.

### UI Components

A comprehensive component library provides consistent styling and behavior. Components include buttons, dialogs, cards, tables, avatars, badges, alerts, tooltips, dropdowns, sheets, and scroll areas. The design system supports dark mode and includes animation support through Framer Motion for smooth transitions.

## OpenAI-Compatible API

The core service implements OpenAI-compatible endpoints that transparently route requests to the appropriate downstream services. This enables existing applications and tools built for OpenAI to work with Bernard without modification.

### Endpoint Mappings

The `/v1/chat/completions` endpoint proxies to the Bernard agent at port 2024, supporting streaming responses and full tool usage. The `/v1/audio/transcriptions` endpoint proxies to whisper.cpp at port 8870 for speech-to-text conversion. The `/v1/audio/speech` endpoint proxies to kokoro at port 8880 for text-to-speech synthesis.

### Request Handling

All endpoints support Bearer token authentication through the Authorization header, cookie-based sessions, and API key authentication through the x-api-key header. Requests are proxied with passthrough of all relevant headers, and responses are streamed or returned based on the endpoint type.

## Worker Queues

Background job processing is implemented using BullMQ with Redis as the backend. Two primary queues handle different workload types.

### Utility Queue

The utility queue processes non-blocking operations that improve user experience without blocking the main request flow. Currently, it handles thread auto-renaming, generating descriptive titles based on conversation content. Jobs are configured with exponential backoff retry logic, configurable concurrency, and automatic cleanup of completed and failed jobs.

### Service Action Queue

The service action queue manages service lifecycle operations, enabling non-blocking service management from the admin interface. Actions include starting, stopping, and restarting services, with the queue ensuring operations complete reliably even during system changes.

## Redis Integration

Redis serves as the central data store for all stateful operations in the platform. The redis-stack-server image provides both Redis functionality and RedisJSON for complex data structures.

### Data Patterns

Session storage uses a custom Better-Auth adapter that stores user sessions, tokens, and session-associated data with indexed lookups for authentication queries. LangGraph checkpoints use a custom serializer that properly handles typed objects, storing conversation state with configurable TTL for automatic cleanup. BullMQ queues use Redis lists and sorted sets for job storage, with the queue prefix preventing naming conflicts with other data.

### Connection Management

All Redis connections use lazy connection strategies to prevent startup failures when Redis is unavailable. The connection pool supports automatic reconnection, and all connections share a single Redis client instance to minimize resource usage.

## Whisper.cpp Service

Whisper.cpp provides high-performance speech-to-text through a C++ implementation of OpenAI's Whisper model. Running on port 8870, it offers real-time transcription capabilities with minimal resource overhead.

### Integration

The service exposes an OpenAI-compatible `/inference` endpoint that accepts audio input and returns transcribed text. It supports various audio formats and provides confidence scores for transcriptions. The core API routes audio transcription requests through this endpoint, enabling speech input for the agent.

### Performance

Whisper.cpp supports multiple acceleration backends including CPU, CUDA, Metal, and various neural network accelerators. The server mode enables concurrent request handling with configurable thread counts.

## Kokoro TTS Service

Kokoro provides text-to-speech synthesis through a FastAPI application running on port 8880. It uses the Kokoro-82M model from HuggingFace for high-quality speech generation.

### OpenAI Speech Endpoint

The service implements `/v1/audio/speech` for OpenAI-compatible speech synthesis. It accepts text input with voice selection and generates audio in multiple formats including MP3, WAV, Opus, FLAC, and PCM. Voice mixing enables combining multiple voicepacks with configurable ratios, creating unique voice characteristics.

### Performance Characteristics

On GPU hardware, Kokoro achieves 35-100x realtime processing speed, generating minutes of audio in seconds. CPU inference is supported with reduced speed but broader hardware compatibility. Streaming support enables first-token delivery in approximately 300ms on GPU, providing responsive audio playback.

### Advanced Features

Phoneme-based synthesis enables direct control over pronunciation through phoneme input. Word-level timestamps are available for caption generation and audio-text alignment. Text normalization handles numbers, dates, and special text for natural speech output.

## Service Configuration

All services are configured through environment variables with sensible defaults. The service configuration system defines startup order, health check endpoints, and dependency relationships.

### Default Ports

| Service     | Port | Type    | Description                          |
|-------------|------|---------|--------------------------------------|
| Redis       | 6379 | Docker  | Cache, queues, sessions              |
| Core        | 3456 | Node    | API gateway, frontend, auth          |
| Bernard     | 2024 | Node    | LangGraph agent                      |
| Whisper.cpp | 8870 | C++     | Speech-to-text                       |
| Kokoro      | 8880 | Python  | Text-to-speech                       |

### Health Checks

Each service exposes a health endpoint that the core uses for monitoring. Services are marked healthy, unhealthy, or unknown based on health check responses. The health monitor runs as a background process, checking service health at configured intervals and logging status changes.

## Development Workflow

The monorepo structure supports parallel development of all components. The core TypeScript application uses npm with scripts for development, building, linting, and testing. Services can be started independently for focused development, or together through the root npm scripts.

### Building Services

The whisper.cpp service requires CMake and a C++ toolchain for building. The kokoro service uses Python with uv for dependency management and requires the Kokoro model weights to be downloaded before first use.

### Running Tests

The core application includes Vitest tests for the agent, components, and library modules. Tests run in a Node environment with proper mocking of external services. The kokoro service includes pytest tests for the API and text processing components.

## Security Considerations

The platform implements several security measures. Authentication uses secure session management with HTTP-only cookies and CSRF protection. API key authentication enables service-to-service communication without session overhead. All authentication methods support granular permission control.

Input validation is performed at multiple layers: the API layer validates request structure, the agent validates tool inputs through Zod schemas, and services validate their specific inputs. The component library provides consistent escaping and sanitization for rendered content.

## Performance Optimization

Several patterns contribute to overall system performance. Redis connection pooling minimizes connection overhead for high-throughput operations. BullMQ job concurrency enables parallel processing of background tasks. Streaming responses reduce time-to-first-byte for long-running operations. Lazy initialization defers expensive operations until actually needed.

The agent's context editing middleware manages conversation size, preventing memory bloat from extended conversations while preserving relevant context for coherent responses.
