# Bernard - Agent Guidelines

This document provides build commands and code style guidelines for agentic coding.

## Build, Lint, and Test Commands

### Root Level
```bash
npm run dev          # Start core dev server
npm run build        # Build core
npm run start        # Start core production
npm run check        # Run core checks
npm run type-check   # TypeScript type checking
```

### Core (Next.js)
```bash
cd core
npm run dev              # Development server
npm run build            # Build Next.js
npm run start            # Production server
npm run lint             # ESLint
npm run type-check       # TypeScript check
npm run test             # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run test:ui          # Vitest UI
```

### Running Single Tests
```bash
# Run a single test file
cd core && npx vitest run src/lib/services/HealthChecker.test.ts

# Watch mode on single file
cd core && npx vitest HealthChecker.test.ts

# Run specific test by name pattern
cd core && npx vitest run -t "should return down status"

# Run tests matching pattern
cd core && npx vitest run --reporter=verbose "HealthChecker"
```

### Bernard API
```bash
cd services/bernard-api
npm run dev          # Development server
npm run build        # TypeScript compile
npm run lint         # ESLint
npm run test         # Run tests
```

### Bernard UI
```bash
cd services/bernard-ui
npm run dev              # Vite dev server
npm run build            # Build + TypeScript compile
npm run type-check       # TypeScript check
npm run lint             # ESLint
npm run tests            # Run all tests
```

### Kokoro (Python)
```bash
cd services/kokoro
uv sync --extra test     # Install dependencies
pytest -v                # Run tests with verbose output
pytest --cov=api         # Run tests with coverage
```

## Code Style Guidelines

### Import Patterns
1. **External dependencies** first (npm packages like `@langchain/langgraph`, `zod`)
2. **Type-only imports** using `import type`
3. **Path-aliased internal imports** (`@/lib/config/settingsCache`)
4. **Relative imports** last (`./types`, `./utils`)

**Example:**
```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";

import { getSettings } from "@/lib/config/settingsCache";
import { ToolFactory } from "./types";
```

### Formatting
- **2 spaces** indentation
- **Trailing commas** on multi-line arrays/objects
- **Always use semicolons**
- ES modules exclusively

### TypeScript Patterns
- **Strict mode** enabled (`strict: true`)
- **Prefer type inference** where possible
- **Export types** with `export type` for type-only exports
- **Zod schemas** for runtime validation
- **Union types with discriminators** for error handling

```typescript
type Result = { ok: true; data: string } | { ok: false; reason: string };

const schema = z.object({
  query: z.string().min(3),
  count: z.number().int().min(1).max(8).optional()
});
```

### Naming Conventions
- **Files**: kebab-case (`web-search.tool.ts`, `get-weather-data.tool.ts`)
- **Functions/Variables**: camelCase (`calculateStringSimilarity`, `const apiKey`)
- **Components/Classes**: PascalCase (`LogViewer`, `ToolFactory`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_SEARXNG_API_URL`)
- **React Hooks**: camelCase with `use` prefix (`useLogStream`, `useServiceStatus`)
- **Tool Factories**: camelCase with `ToolFactory` suffix (`webSearchToolFactory`)

### Error Handling
- **Prefer return-type discriminators** over throwing:
```typescript
function normalizeApiKey(key: string | null): { ok: true; apiKey: string } | { ok: false; reason: string } {
  if (!key?.trim()) return { ok: false, reason: "Missing key" };
  return { ok: true, apiKey: key.trim() };
}
```
- **Use `instanceof Error`** for type checking
- **Structured logging** with Pino logger

### Documentation
- **JSDoc comments** for exported functions with `@param` and `@returns`
- **Module header comments** at top of files
- **Minimal inline comments** - code should be self-documenting

```typescript
/**
 * Calculate Jaro-Winkler similarity between two strings
 * @param s1 First string
 * @param s2 Second string
 * @returns Similarity score between 0 and 1
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number { }
```

### File Organization
- **agents/**: LangGraph agents (bernard/, shared/)
- **app/**: Next.js app directory with route groups
- **components/**: React components
- **hooks/**: Custom React hooks
- **lib/**: Utilities, config, infra
- **tests/**: Co-located in `tests/unit/` and `tests/integration/`

### Tool Implementation Pattern
```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const myTool = tool(
  async ({ param }, config) => {
    // Implementation
    return result;
  },
  {
    name: "my_tool",
    description: "Description here",
    schema: z.object({
      param: z.string().min(1)
    })
  }
);

export const myToolFactory: ToolFactory = async () => {
  return { ok: true, tool: myTool, name: myTool.name };
};
```

### React Components
```typescript
'use client'; // Mark client components

interface ComponentProps {
  prop1: string;
  prop2?: number;
}

export function MyComponent({ prop1, prop2 }: ComponentProps) {
  // Use custom hooks
  const { data, loading } = useSomeHook();
  // ...
}
```

### Testing
- **Vitest** for TypeScript, **Pytest** for Python
- **Global test functions** enabled (`describe`, `it`, `expect`)
- **30 second timeout** for tests
- **Coverage** with v8 provider

```typescript
import { describe, it, expect } from "@jest/globals";

describe("MyComponent", () => {
  it("should do something", () => {
    expect(result).toBe(expected);
  });
});
```

### Logging
- **Pino logger** with structured logging
- **Sensitive data redaction** configured (apiKey, token, password, etc.)
- **Context-aware logging** with `childLogger`
```typescript
logger.info('Message with context', { requestId, userId });
```

### Security
- **Never log secrets** - use redaction paths in logger config
- **Validate inputs** with Zod schemas
- **Sanitize error messages** before exposing to users
