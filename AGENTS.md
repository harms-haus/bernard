# Bernard - AI Agent Monorepo

**Generated:** Sun Jan 11 2026
**Commit:** 8b0e23c
**Branch:** dev

## OVERVIEW
Monorepo with Next.js API server, LangGraph AI agent (Bernard), React Vite frontend, Python FastAPI TTS (Kokoro), and C++ speech recognition (whisper.cpp). Core orchestrates services via API gateway pattern.

## STRUCTURE
```
./
├── core/                    # Next.js + LangGraph server (port 3456)
│   ├── src/
│   │   ├── agents/bernard/ # LangGraph agent (port 2024)
│   │   ├── app/api/        # Next.js API routes + service proxying
│   │   ├── components/      # Dashboard components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/           # Shared libraries (auth, config, services, infra)
│   └── scripts/            # Dev server, agent starter
├── services/
│   ├── bernard-ui/        # React Vite frontend (port 8810)
│   ├── kokoro/            # FastAPI TTS (port 8880)
│   └── whisper.cpp/       # Whisper STT (port 8870)
└── scripts/                # Service management scripts
```

## WHERE TO LOOK
| Task | Location | Notes |
|-------|----------|-------|
| Agent tools | `core/src/agents/bernard/tools/` | 12 tools using factory pattern |
| Service config | `core/src/lib/services/ServiceConfig.ts` | All services defined here |
| Auth system | `core/src/lib/auth/` | Session-based with OAuth |
| API proxying | `core/next.config.mjs` | Next.js rewrites to services |
| UI components | `services/bernard-ui/src/components/` | shadcn/ui + chat components |
| TTS service | `services/kokoro/api/src/main.py` | FastAPI entry point |

## SERVICES (7 total)
| Name | Port | Type | Description |
|------|------|------|-------------|
| redis | 6379 | docker | Cache/queue |
| core | 3456 | node | API gateway |
| bernard-agent | 2024 | node | LangGraph agent |
| bernard-ui | 8810 | node | React frontend |
| vllm | 8860 | python | Embedding service |
| whisper | 8870 | cpp | Speech-to-text |
| kokoro | 8880 | python | Text-to-speech |

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

## COMMANDS
```bash
# Root (delegates to core)
npm run dev              # Start core dev server
npm run build            # Build core app
npm run type-check       # TypeScript type check

# Core (TypeScript)
cd core
npm run agent:bernard   # Start LangGraph agent
npm run test            # Vitest (node environment)
npm run lint            # ESLint check

# Bernard UI (TypeScript)
cd services/bernard-ui
npm run dev             # Vite dev server (proxies to core:3456)
npm run test            # Vitest (jsdom environment)

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

## TESTING
- **Vitest**: TypeScript projects (core, bernard-ui)
  - Core: `node` environment, global mocks in `vitest.setup.ts`
  - UI: `jsdom` environment for React components
  - Coverage: v8 provider, excludes node_modules/.next/dist
- **Pytest**: Python (kokoro)
  - Async tests with `@pytest.mark.asyncio`
  - Coverage enabled by default
- **No C++ tests**: whisper.cpp has no test infrastructure

## NOTES
- **No CI/CD**: No GitHub Actions workflows configured
- **Duplicate configs**: `tailwind.config.js` AND `tailwind.config.ts` in core (remove one)
- **No Prettier**: Formatting relies on ESLint or manual formatting
- **No `.cursor/rules`**: AGENTS.md is the primary style guide
- **No `/lib/shared`**: Mentioned in AGENTS.md but doesn't exist
