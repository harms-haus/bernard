# Bernard - AI Agent Monorepo

**Generated:** 2026-01-23
**Commit:** 7e4a504
**Branch:** dev

## OVERVIEW
Monorepo with Next.js API server, LangGraph AI agent (Bernard), Python FastAPI TTS (Kokoro), and C++ speech recognition (whisper.cpp). Core orchestrates services via API gateway pattern.

## STRUCTURE
```
./
├── core/                    # Next.js + LangGraph server (port 3456)
│   ├── src/
│   │   ├── agents/bernard/ # LangGraph agent (port 2024)
│   │   ├── app/api/        # Next.js API routes + service proxying
│   │   ├── components/     # Dashboard components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Shared libraries (auth, config, services, infra)
│   └── scripts/            # Dev server, agent starter
├── services/
│   ├── kokoro/             # FastAPI TTS (port 8880)
│   └── whisper.cpp/        # Whisper STT (port 8870)
└── scripts/                # Service management scripts
```

## WHERE TO LOOK
| Task | Location | Notes |
|-------|----------|-------|
| Agent tools | `core/src/agents/bernard/tools/` | 12 tools using factory pattern |
| Service config | `core/src/lib/services/ServiceConfig.ts` | All services defined here |
| Auth system | `core/src/lib/auth/` | Session-based with OAuth |
| API proxying | `core/next.config.mjs` | Next.js rewrites to services |
| TTS service | `services/kokoro/api/src/main.py` | FastAPI entry point |
| Internal docs | `core/src/AGENTS.md` | Detailed agent/library docs |

## SERVICES (5 total)
| Name | Port | Type | Description |
|------|------|------|-------------|
| redis | 6379 | docker | Cache/queue (redis-stack-server) |
| core | 3456 | node | API gateway (Next.js) |
| bernard-agent | 2024 | node | LangGraph agent |
| whisper | 8870 | cpp | Speech-to-text |
| kokoro | 8880 | python | Text-to-speech |

## BUN INSTALLATION
Bun is required for this project. Install via:
```bash
curl -fsSL https://bun.sh/install | bash
```
Verify installation: `bun --version` (should be ≥1.3.6)

## COMMAND MAPPING
| Command | npm (old) | bun (current) |
|---------|------------|---------------|
| dev | npm run dev | bun run dev |
| build | npm run build | bun run build |
| type-check | npm run type-check | bun run type-check |
| test | npm run test | bun run test |
| lint | npm run lint | bun run lint |

## COMMANDS
```bash
# Root (delegates to core)
bun run dev              # Start core dev server
bun run build            # Build core app
bun run type-check       # TypeScript type check

# Core (TypeScript)
cd core
bun run agent:bernard   # Start LangGraph agent
bun run test            # Vitest tests
bun run lint            # ESLint check

# Kokoro (Python)
cd services/kokoro
./start-cpu.sh          # CPU TTS (uvicorn + CPU PyTorch)
./start-gpu.sh          # GPU TTS (uvicorn + CUDA)
uv run ruff check .     # Linting
python -m pytest        # Pytest tests

# Whisper.cpp (C++)
cd services/whisper.cpp
cmake -B build && cmake --build build --config Release
./build/bin/whisper-cli -f samples/jfk.wav
```

## CONVENTIONS
- **TypeScript strict mode**: No `as any`, `@ts-ignore`, or `@ts-expect-error`
- **Result types**: Discriminated unions `{ok: true; data: T} | {ok: false; error: string}`
- **Tool factories**: Async functions returning `{ok: true; tool} | {ok: false; name, reason}`
- **Barrel exports**: `index.ts` files for module organization
- **ES Modules only**: No `require()`, use `import/export`
- **Path aliases**: `@/` → `./src/*` in all TS projects

## ANTI-PATTERNS (THIS PROJECT)
- **NO cross-service imports**: Bernard agent must be standalone (copy code, don't import)
- **NO emojis/markdown in agent responses**: Bernard outputs plain text for TTS
- **NO custom Error classes**: Use standard Error with discriminators
- **NO `set_timer_sync`**: Use `set_timer` for background tasks

## GAPS & TODOS
- **No CI/CD**: No GitHub Actions workflows configured
- **No Prettier**: Formatting relies on ESLint only
- **Bun Migration**: Completed Phase 1 (2026-01-23) - Runtime and package manager migrated to Bun
