# Bernard Core Service

The core service is a Next.js application running on port 3456. It serves as single entry point for all client interactions, handling authentication, request routing, and service orchestration.

## Setup

### 1. Install Bun

Bun is required for this project. Install via:
```bash
curl -fsSL https://bun.sh/install | bash
```

Verify installation: `bun --version` (should be ≥1.3.6)

### 2. Install Dependencies

From the `core/` directory:
```bash
bun install
```

### 3. Environment Variables

Create a `.env` file (one has been provided for you):
```env
BETTER_AUTH_SECRET=<your-secret>
BETTER_AUTH_URL=http://localhost:3456
NEXT_PUBLIC_APP_URL=http://localhost:3456
```

### 4. Run Development Server

Start the Next.js development server:
```bash
bun run dev
```

The server will be available at http://localhost:3456

### 5. Start Bernard Agent

Start the Bernard LangGraph agent separately:
```bash
bun run agent:bernard
```

The agent will be available at http://localhost:2024

## Available Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Next.js dev server (port 3456) |
| `bun run dev:core` | Start core server only |
| `bun run agent:bernard` | Start Bernard LangGraph agent (port 2024) |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run type-check` | TypeScript type checking |
| `bun run test` | Run tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:coverage` | Run tests with coverage report |
| `bun run test:ui` | Run tests with UI |

## Architecture

The core service follows an API gateway pattern:

- **OpenAI-compatible endpoints** at `/api/v1/*` proxy requests to appropriate services:
  - Chat completions → Bernard agent
  - Audio transcription → whisper.cpp
  - Speech synthesis → Kokoro

- **LangGraph SDK endpoints** at `/threads/*`, `/runs/*`, `/assistants/*` for direct agent access

- **Admin endpoints** at `/api/admin/*`, `/api/services/*` for service management

## Authentication

Authentication is implemented using Better-Auth with:
- Email/password credentials
- OAuth providers (GitHub, Google)
- Session-based authentication with Redis backend
- Role-based access control (admin role for elevated permissions)

## Services

| Service | Port | Type | Description |
|----------|-------|-------|-------------|
| Core API | 3456 | node | API gateway and frontend |
| Bernard Agent | 2024 | node | LangGraph agent |
| Redis | 6379 | docker | Session storage and queues |

## Testing

Run tests with:
```bash
bun run test
```

Run tests in watch mode during development:
```bash
bun run test:watch
```

## Building for Production

Build the application:
```bash
bun run build
```

Start the production server:
```bash
bun run start
```
