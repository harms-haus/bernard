# Test Infrastructure

This directory contains shared test infrastructure used across all test files.

## Structure

```
test/
├── mocks/              # Mock factories and fixtures
│   ├── index.ts        # Barrel export
│   ├── auth.ts         # Auth mocking (useAuth, authClient)
│   ├── providers.ts    # Context provider mocks
│   ├── hooks.ts        # Hook-specific mocks
│   └── external.ts     # External dependencies (EventSource, fetch)
├── wrappers/           # React wrapper components
│   ├── index.ts        # Barrel export
│   ├── component-wrappers.tsx  # Component test wrappers
│   └── hook-wrappers.tsx       # Hook test wrappers
└── helpers/            # Test helper utilities
    ├── index.ts        # Barrel export
    ├── render-helpers.ts      # Rendering utilities
    └── mock-factories.ts      # Mock factories
```

## Usage

### Using Mocks

```typescript
import { mockUseAuth, mockUseAdminAuth, mockUseHealthStream } from '@/test/mocks';
import { createMockAuthClient, createMockEventSource } from '@/test/mocks';
```

### Using Wrappers

```typescript
import { renderWithAuth, renderWithAdmin, renderWithRouter } from '@/test/helpers';
import { AuthProviderWrapper, DarkModeProviderWrapper } from '@/test/wrappers';
```

### Using Helpers

```typescript
import { createMockFetch, createMockEventSource } from '@/test/mocks';
import { waitForLoadingComplete } from '@/test/helpers';
```

## Mock Patterns

### Auth Mock Pattern

```typescript
// Use pre-built mocks
const mockAuth = mockUseAuth();
const mockAdmin = mockUseAdminAuthAsAdmin();

// Or customize
const customMock = mockUseAuth({
  state: { user: { id: '1', role: 'user' }, loading: true, error: null },
});
```

### SSE Mock Pattern

```typescript
import { createMockEventSource } from '@/test/mocks/external';

const mockEventSource = createMockEventSource();
mockEventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle message
};
```

## Best Practices

1. **Import from `@/test/mocks`** for consistency
2. **Use wrappers** for context-dependent hooks
3. **Prefer existing mocks** over creating new ones
4. **Document custom mocks** if needed
5. **Clean up in `afterEach`** (handled automatically)
