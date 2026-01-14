# Phase 5.1 Refactoring Plan: Testable Component Architecture

**Created:** January 13, 2026
**Status:** Planned
**Goal:** Make chat components (ConversationHistory, Thread, AssistantMessage) unit testable without complex provider mocking

## Problem Statement

Current test status: 87/132 tests passing (66%)
- 3 test files failing with 45 tests
- Root cause: Context-based hooks prevent easy mocking
- Vitest hoisting and module caching break typical mock patterns

### Failing Tests

| Component | Failing Tests | Missing Mocks |
|-----------|--------------|---------------|
| `Thread` | 19 | `useStreamContext`, `useThreads`, `useAuth`, `useDarkMode` |
| `AssistantMessage` | 12 | `useStreamContext` |
| `ConversationHistory` | 14 | `useThreads`, `useAuth` |

## Root Causes

### 1. Direct Hook Usage in Components

```typescript
// Current pattern - hard to test
export function Thread() {
  const [searchParams] = useSearchParams();        // React Router
  const thread = useStreamContext();                // Custom context
  const { threads } = useThreads();                 // Custom context  
  const { isDarkMode } = useDarkMode();             // Custom context
  // ...
}
```

### 2. Multiple Provider Dependencies

Components require:
- `<MemoryRouter>` for React Router hooks
- `<ThreadProvider>` for thread state
- `<StreamProvider>` for streaming state
- `<AuthProvider>` for authentication state

### 3. Vitest Mocking Limitations

- `vi.mock` is hoisted before imports
- Module caching prevents mock updates
- Context objects are different between mock and real providers

## Solution Architecture

### Pattern 1: Dependency Injection via Props

Extract dependencies into optional props with defaults.

```typescript
// Proposed pattern
interface ThreadProps {
  // Hook dependencies (optional for testing)
  useSearchParams?: () => [URLSearchParams, ReturnType<typeof useSetSearchParams>];
  useStreamContext?: () => StreamContextType;
  useThreads?: () => ThreadContextType;
  useDarkMode?: () => DarkModeContextType;
  useAuth?: () => AuthContextType;
  
  // Component dependencies (optional for testing)
  WelcomeMessage?: React.ComponentType;
  ChatInput?: React.ComponentType;
  MessageList?: React.ComponentType;
  LoadingIndicator?: React.ComponentType;
}

export function Thread({
  useSearchParams = () => useSearchParamsImpl(),
  useStreamContext = () => useStreamContextImpl(),
  useThreads = () => useThreadsImpl(),
  useDarkMode = () => useDarkModeImpl(),
  useAuth = () => useAuthImpl(),
  WelcomeMessage = DefaultWelcomeMessage,
  ChatInput = DefaultChatInput,
  MessageList = DefaultMessageList,
  LoadingIndicator = DefaultLoadingIndicator,
}: ThreadProps) {
  // Use the injected dependencies
  const [searchParams] = useSearchParams();
  const stream = useStreamContext();
  // ...
}
```

**Benefits:**
- Tests can inject mock functions
- No provider wrapping required
- Clear dependency contract
- Components remain backward compatible

### Pattern 2: Hook Extraction

Move hook logic into separate, pure functions.

```typescript
// hooks/useThreadData.ts (extracted from Thread component)
export function useThreadData(threadId: string | null) {
  const [searchParams] = useSearchParams();
  const stream = useStreamContext();
  const { threads, getThreads } = useThreads();
  
  // Pure business logic
  const messages = stream.messages;
  const isLoading = stream.isLoading;
  const latestProgress = stream.latestProgress;
  
  const thread = threads.find(t => t.id === threadId);
  
  return {
    messages,
    isLoading,
    latestProgress,
    thread,
    threadId,
    // Computed values
    hasMessages: messages.length > 0,
    showWelcome: !threadId && messages.length === 0,
  };
}
```

**Benefits:**
- Hooks can be mocked independently
- Pure functions are easier to test
- Business logic separated from UI

### Pattern 3: Context Container Pattern

Use a mutable container that can be updated for tests.

```typescript
// test/mocks/contextContainers.ts
export const streamContextContainer = {
  current: createDefaultStreamContext(),
  update(overrides: Partial<StreamContextType>) {
    Object.assign(this.current, overrides);
  },
  reset() {
    this.current = createDefaultStreamContext();
  },
};

// hooks/useStreamContext.ts
export function useStreamContext() {
  const context = useContext(StreamContext);
  if (context === undefined) {
    // Return container value for testing
    return streamContextContainer.current;
  }
  return context;
}
```

**Benefits:**
- No hoisting issues
- Works with existing components
- Can update context between tests

### Pattern 4: Test Wrapper Components

Create reusable test wrappers.

```typescript
// test/wrappers/ThreadTestWrapper.tsx
interface ThreadTestWrapperProps {
  children: React.ReactNode;
  threadId?: string;
  messages?: Message[];
  isLoading?: boolean;
}

export function ThreadTestWrapper({ 
  children, 
  threadId = null,
  messages = [],
  isLoading = false,
}: ThreadTestWrapperProps) {
  return (
    <MemoryRouter initialEntries={threadId ? [`/?threadId=${threadId}`] : ['/']}>
      <ThreadProvider>
        <StreamProviderWrapper messages={messages} isLoading={isLoading}>
          <AuthProviderWrapper>
            <DarkModeProviderWrapper>
              {children}
            </DarkModeProviderWrapper>
          </AuthProviderWrapper>
        </StreamProviderWrapper>
      </ThreadProvider>
    </MemoryRouter>
  );
}
```

**Benefits:**
- Reusable across tests
- Encapsulates provider complexity
- Clear test setup

## Implementation Plan

### Phase 1: Extract Hook Dependencies (Low Risk)

1. **Create `useThreadData` hook**
   - Location: `src/hooks/useThreadData.ts`
   - Extract business logic from `Thread` component
   - Return computed values for UI rendering

2. **Create `useAssistantMessageData` hook**
   - Location: `src/hooks/useAssistantMessageData.ts`
   - Extract metadata logic from `AssistantMessage`
   - Return branch info, checkpoint data

3. **Create `useConversationHistoryData` hook**
   - Location: `src/hooks/useConversationHistoryData.ts`
   - Extract sidebar/thread list logic

### Phase 2: Add Dependency Injection (Medium Risk)

1. **Update `Thread` component**
   - Add optional prop dependencies
   - Use default values from existing hooks
   - Maintain backward compatibility

2. **Update `AssistantMessage` component**
   - Add `useStreamContext` prop
   - Add `onRegenerate` prop (already exists)
   - Make message prop optional for testing

3. **Update `ConversationHistory` component**
   - Add `useThreads` prop
   - Add `useAuth` prop
   - Add `useSearchParams` prop

### Phase 3: Create Test Infrastructure (Low Risk)

1. **Create context containers**
   - `src/test/context/streamContextContainer.ts`
   - `src/test/context/threadContextContainer.ts`
   - `src/test/context/authContextContainer.ts`

2. **Update hooks to use containers**
   - Modify `useStreamContext` to check container first
   - Modify `useThreads` to check container first
   - Modify `useAuth` to check container first

3. **Create test wrappers**
   - `src/test/wrappers/ThreadTestWrapper.tsx`
   - `src/test/wrappers/AssistantMessageTestWrapper.tsx`
   - `src/test/wrappers/ConversationHistoryTestWrapper.tsx`

### Phase 4: Update Tests (Medium Risk)

1. **Rewrite `Thread.test.tsx`**
   - Use dependency injection pattern
   - Remove complex provider mocking
   - Test with injected mock functions

2. **Rewrite `AssistantMessage.test.tsx`**
   - Use context container pattern
   - Simplify test setup

3. **Rewrite `ConversationHistory.test.tsx`**
   - Use test wrappers
   - Simplify thread list tests

## File Changes

### New Files

```
src/
├── hooks/
│   ├── useThreadData.ts           # Extracted from Thread
│   ├── useAssistantMessageData.ts # Extracted from AssistantMessage
│   └── useConversationHistoryData.ts # Extracted from ConversationHistory
└── test/
    ├── context/
    │   ├── streamContextContainer.ts
    │   ├── threadContextContainer.ts
    │   └── authContextContainer.ts
    └── wrappers/
        ├── ThreadTestWrapper.tsx
        ├── AssistantMessageTestWrapper.tsx
        └── ConversationHistoryTestWrapper.tsx
```

### Modified Files

```
src/components/chat/
├── Thread.tsx                    # Add dependency injection props
├── AssistantMessage.tsx          # Add dependency injection props
└── ConversationHistory.tsx       # Add dependency injection props

src/providers/
├── StreamProvider.tsx            # Export context container
├── ThreadProvider.tsx            # Export context container
└── hooks/
    ├── useStreamContext.ts       # Use context container
    ├── useThreads.ts             # Use context container
    └── useAuth.ts                # Use context container
```

## Testing Strategy

### Unit Tests (Fast, Isolated)

```typescript
// Thread.test.tsx - With dependency injection
it('shows welcome message when no thread selected', () => {
  const mockUseSearchParams = vi.fn(() => [new URLSearchParams(), vi.fn()]);
  const mockUseStreamContext = vi.fn(() => ({
    messages: [],
    isLoading: false,
    getMessagesMetadata: () => ({}),
  }));
  
  render(<Thread 
    useSearchParams={mockUseSearchParams}
    useStreamContext={mockUseStreamContext}
  />);
  
  expect(screen.getByTestId('welcome-message')).toBeInTheDocument();
});
```

### Integration Tests (With Providers)

```typescript
// Thread.integration.test.tsx - With providers
it('creates new thread when new chat button clicked', async () => {
  render(
    <ThreadTestWrapper messages={[]}>
      <Thread />
    </ThreadTestWrapper>
  );
  
  fireEvent.click(screen.getByTestId('new-chat-button'));
  
  await waitFor(() => {
    expect(mockCreateThread).toHaveBeenCalled();
  });
});
```

### E2E Tests (With Real API)

```typescript
// Thread.e2e.test.tsx - With MSW
it('loads messages from API', async () => {
  server.use(
    http.get('/api/threads/:id/messages', () => {
      return HttpResponse.json({ messages: mockMessages });
    })
  );
  
  render(<Thread threadId="thread-123" />);
  
  await waitFor(() => {
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
  });
});
```

## Rollout Strategy

### Step 1: Extract Hooks (Independent)

Extract hooks first - no breaking changes.

### Step 2: Add Props (Backward Compatible)

Add optional props with default values - no breaking changes.

### Step 3: Update Tests (No Production Impact)

Update tests to use new patterns - no production changes.

### Step 4: Remove Legacy Patterns (Optional)

After tests pass, remove legacy mock patterns from setup.ts.

## Success Criteria

- [ ] All 132 tests passing
- [ ] No provider wrapping required for unit tests
- [ ] Test setup time reduced by 50%
- [ ] Tests run in < 1 second each
- [ ] No regression in component functionality

## Migration Guide

### For Existing Tests

```typescript
// Before (complex mocking)
vi.mock('../../providers/StreamProvider', ...);
const streamContext = createMockStreamContext({ messages: [...] });
render(
  <MockStreamProvider value={streamContext}>
    <Thread />
  </MockStreamProvider>
);

// After (simple injection)
const mockUseStreamContext = vi.fn(() => ({
  messages: [...],
  isLoading: false,
  getMessagesMetadata: () => ({}),
}));

render(<Thread useStreamContext={mockUseStreamContext} />);
```

### For New Tests

```typescript
// Use test wrappers for integration tests
render(
  <ThreadTestWrapper messages={[mockMessage]}>
    <Thread />
  </ThreadTestWrapper>
);

// Use dependency injection for unit tests
render(<Thread useSearchParams={mockUseSearchParams} />);
```

## Open Questions

1. **Should we use a testing library like MSW?**
   - Recommendation: Yes, for API-level integration tests
   - Keep unit tests fast with mocked dependencies

2. **Should we use React Testing Library's `renderHook`?**
   - Recommendation: Yes, for testing extracted hooks
   - Keeps hook tests isolated

3. **Should we add Visual Regression Testing?**
   - Recommendation: Consider for UI components
   - Use chromatic or Percy

4. **How to handle context initialization?**
   - Option A: Context containers (proposed)
   - Option B: Test-specific providers
   - Option C: React Contexts for Testing (react-testing-library)

## Timeline Estimate

| Phase | Effort | Risk | Duration |
|-------|--------|------|----------|
| Extract Hooks | 2 days | Low | Week 1 |
| Add Props | 1 day | Low | Week 1 |
| Test Infrastructure | 2 days | Low | Week 2 |
| Update Tests | 2 days | Medium | Week 2 |
| **Total** | **7 days** | - | **2 weeks** |

## References

- [React Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Vitest Module Mocking](https://vitest.dev/guide/mocking.html)
- [Testing React Context](https://react.dev/learn/writing-tests#testing-custom-hooks)
- [Dependency Injection in React](https://www.patterns.dev/posts/dependency-injection-pattern/)
