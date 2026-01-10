# AGENTS.md - Bernard Codebase Guide

This guide helps AI agents work effectively in this monorepo containing Next.js, React, Python, and C++ services.

## Project Structure

```
bernard/
├── core/                   # Next.js + LangGraph server (TypeScript)
├── services/
│   ├── bernard-ui/        # React Vite frontend (TypeScript)
│   ├── kokoro/            # FastAPI TTS service (Python)
│   └── whisper.cpp/       # Whisper speech recognition (C++)
└── lib/shared/            # Shared libraries
```

## Build, Lint, and Test Commands

### Root Commands (from `/`)
```bash
npm run build              # Build core app
npm run dev                # Start core dev server
npm run type-check         # TypeScript type check
```

### TypeScript Projects (core, bernard-ui)
```bash
cd core                    # or cd services/bernard-ui

# Build
npm run build              # Production build
npm run dev                # Dev server
npm run type-check         # tsc --noEmit

# Linting
npm run lint              # ESLint check

# Testing
npm run test               # Run all tests (vitest run)
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage
npx vitest run filename.test.ts              # Single test file
npx vitest run -t "test name"                 # Single test by name
npx vitest run --run src/lib/services/       # Tests in directory
```

### Python Project (kokoro)
```bash
cd services/kokoro

# Build/Run
./start-cpu.sh            # Start with CPU (auto-install deps)
./start-gpu.sh            # Start with GPU (auto-install deps)
uv run python api/src/main.py

# Linting/Formatting (Ruff)
uv run ruff check .       # Check linting
uv run ruff check --fix . # Auto-fix
uv run ruff format .      # Format code
uv run ruff format --check . # Check formatting

# Testing (Pytest)
python -m pytest          # Run all tests
python -m pytest -v       # Verbose
python -m pytest api/tests/test_file.py              # Single file
python -m pytest -k "test_name"                     # By name
python -m pytest api/tests/test_file.py::test_func   # Specific test
```

### C++ Project (whisper.cpp)
```bash
cd services/whisper.cpp

# Build
cmake -B build && cmake --build build --config Release

# Test/Run
./build/bin/whisper-cli -f samples/jfk.wav
make base.en              # Download and test model
```

## Code Style Guidelines

### Import Style
- **ES Modules only** - No `require()`
- **Named imports preferred**: `import { BaseMessage } from "@langchain/core/messages"`
- **Path aliases**: Use `@/` for internal modules: `import { logger } from '@/lib/logging/logger'`
- **Type-only imports**: `import type { User } from '../types/auth'`

### TypeScript Usage
- **Strict mode enabled** - No `as any` or `@ts-ignore`
- **Explicit type annotations** on function parameters and returns
- **Type definitions** for simple objects, **interfaces** for public APIs
- **Discriminated unions** for result types:

```typescript
type Result<T> = { ok: true; data: T } | { ok: false; error: string }
```

### Naming Conventions
- **camelCase**: Functions, variables, methods (`getMessageText`, `loadChatModel`)
- **PascalCase**: Types, interfaces, classes, components (`ServiceManager`, `LogEntry`, `CombinedLogs`)
- **SCREAMING_SNAKE_CASE**: Constants (`DEFAULT_TIMEOUT_MS`, `QUEUE_NAME`)
- **Descriptive names**: Verbs for actions (`formatDoc`, `buildUrl`, `startTimer`)
- **File naming**: `.tool.ts` for LangGraph tools, `.test.ts` for tests, `.tsx` for React components, `index.ts` for barrel exports

### Error Handling
- **Result type pattern** for async operations:
```typescript
type WeatherFetchResult<T> = { ok: true; data: T } | { ok: false; error: string }

try {
  const res = await fetch(url);
  if (!res.ok) return { ok: false, error: weatherError(`${res.status} ${res.statusText}`) };
  return { ok: true, data: await res.json() };
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return { ok: false, error: msg };
}
```
- **Try-catch with explicit error conversion**: Convert unknown errors to Error objects
- **Context-aware logging**: Include request IDs, duration, error codes
- **No custom Error classes** - Use standard Error with discriminators

### File Organization
- **Monorepo structure** - Separate packages for different services
- **Agent pattern**:
  ```
  agents/agent-name/
  ├── agent-name.agent.ts      # Main entry
  ├── configuration.ts          # Config
  ├── state.ts                  # State definitions
  ├── tools/                    # .tool.ts files
  │   └── index.ts              # Barrel export
  ├── utils.ts
  └── prompts/                  # .prompt.ts files
  ```
- **Barrel exports** (index.ts) for logical groupings
- **Path aliases** in tsconfig.json: `@/*` → `./src/*`

### Component/Function Patterns
- **Custom hooks**: `useLogStream`, `useDialogManager` with useCallback/useEffect cleanup
- **Factory functions**: `webSearchToolFactory` returning `ToolFactoryResult`
- **Singleton patterns**: Lazy initialization with `getUtilityQueue()` style
- **Pure utility functions**: Small, testable, side-effect free

## Linting and Formatting

### TypeScript (core, bernard-ui)
- **ESLint**: Configured in `.eslintrc.cjs` for UI, Next.js built-in for core
  - `@typescript-eslint/no-unused-vars`: Error (underscore prefix ignored)
  - `@typescript-eslint/no-explicit-any`: Off
- **No Prettier configured** - Code formatting relies on ESLint rules or manual formatting
- **Line length**: No enforced limit for TypeScript

### Python (kokoro)
- **Ruff** for linting and formatting
- **Line length**: 88 characters
- **Import sorting**: `isort` rules with force-wrap-aliases and combine-as-imports
- **Config**: `.ruff.toml`

### C++ (whisper.cpp)
- **No linter configured** - Follow project conventions

## Testing

### Vitest (TypeScript)
- **Test files**: `*.test.ts`, `*.test.tsx`
- **Framework**: Vitest with globals enabled
- **Environment**: `node` for core, `jsdom` for UI
- **Setup**: `vitest.setup.ts` for global mocks and directory creation
- **Timeout**: 30 seconds default
- **Coverage**: v8 provider, excludes `node_modules`, `.next`, `dist`, test files

### Test Patterns
```typescript
describe('Component', () => {
  beforeEach(() => { /* Setup */ })
  it('should do X', () => {
    // Arrange, Act, Assert
    expect(result).toBe(expected)
  })
})
```

### React Testing
- **Library**: `@testing-library/react`
- **Pattern**: Render → Query → Assert
- **Mocking**: `vi.fn()` for mocks, `vi.stubEnv()` for environment variables

### Pytest (Python)
- **Test files**: `test_*.py` in `api/tests/` and `ui/tests/`
- **Coverage**: Enabled by default
- **Config**: `pytest.ini`

## Additional Notes

### Styling
- **Tailwind CSS** with shadcn/ui design system
- **Dark mode**: Class-based
- **CSS variables** for theming (primary, secondary, destructive, muted, accent, etc.)
- **Tailwind configs**: `tailwind.config.ts` in core, `tailwind.config.js` in UI

### Configuration
- **Environment**: `.env` files (use `.env.example` as template)
- **TypeScript paths**: `@/` → `./src/*` configured in tsconfig.json
- **Proxying**: Core Next.js proxies to services on specific ports (3456, 8800, 8810, 2024)

### No Cursor/Copilot Rules
- No `.cursor/rules/` or `.cursorrules` found
- No `.github/copilot-instructions.md` found
