# Bernard Testing Improvements - Tasks C: Component Coverage
**Generated:** 2026-01-18
**Target Coverage:** 70% overall (currently 20.6%)
**Focus Areas:** Layout Components, Dashboard Components, Context Providers, UI Primitives

## Executive Summary

This plan addresses the **38+ component files** with 0% or low coverage organized by functional category. Components form the visual layer of the application and are critical for user-facing quality.

### Current State: Pre-existing Tests

The codebase already has **9 test files** for chat components that follow a specific pattern:

| File | Tests |
|------|-------|
| `providers/StreamProvider.test.tsx` | Stream context mocking |
| `components/chat/messages/ai.test.tsx` | 120+ lines, comprehensive |
| `components/chat/messages/human.test.tsx` | Edit mode, keyboard shortcuts |
| `components/chat/messages/tool-calls.test.tsx` | Tool calls, results, expansion |
| `components/chat/messages/progress.test.tsx` | Progress indicators, context |
| `components/chat/messages/loading.test.tsx` | Loading states |
| `components/chat/Thread.test.tsx` | Message rendering, input |
| `components/chat/BranchSwitcher.test.tsx` | Branch navigation |
| `components/chat/ErrorState.test.tsx` | Error states |

**These existing tests are NOT counted in the 20.6% coverage** and should be preserved when adding new tests.

### Files Covered in This Plan

| Category | Files | Current Coverage | Priority |
|----------|-------|-----------------|----------|
| Context Providers | 6 files | 0-25% | P0 |
| Layout Components | 4 files | 0% | P1 |
| Dashboard Components | 5 files | 0% | P1 |
| Dynamic Sidebar | 6 files | 0% | P2 |
| Dynamic Header | 2 files | 0% | P2 |
| UI Primitives | 15+ files | 0-72% | P2 |

---

## Phase 1: Context Providers Testing (P0)

Context providers affect many child components and represent high-value testing targets.

### 1.1 ToastManager (`components/ToastManager.tsx`)

**File Location:** `core/src/components/ToastManager.tsx`

#### Implementation Analysis

**Purpose:** Toast notification state management system with context API

**Correct Context Interface (ACTUAL):**
```typescript
interface ToastManagerContextType {
  toasts: ToastConfig[];
  showToast: (config: Omit<ToastConfig, 'id'>) => string;
  hideToast: (id: string) => void;
  clearToasts: () => void;
}

interface ToastConfig {
  id: string;
  variant: 'default' | 'success' | 'warning' | 'error' | 'info';
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  duration?: number;
}
```

**NOTE:** The `success()`, `error()`, `warning()`, `info()`, `message()` methods are on a **separate hook** `useToast()`, NOT on `useToastManager()`.

#### Test Scenarios

**Test 1.1.1: Toast Management**
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastManagerProvider, useToastManager } from './ToastManager';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Test Component that uses the hook
const TestComponent = ({ onToastId }: { onToastId?: (id: string) => void }) => {
  const { showToast, hideToast, clearToasts } = useToastManager();

  return (
    <div>
      <button onClick={() => {
        const id = showToast({ title: 'Test', variant: 'default' });
        onToastId?.(id);
      }}>Show</button>
      <button onClick={() => hideToast('test-id')}>Hide</button>
      <button onClick={clearToasts}>Clear</button>
    </div>
  );
};

describe('ToastManager', () => {
  describe('showToast', () => {
    it('should generate unique ID and add toast', () => {
      let toastId = '';
      render(
        <ToastManagerProvider>
          <TestComponent onToastId={(id) => (toastId = id)} />
        </ToastManagerProvider>
      );

      fireEvent.click(screen.getByText('Show'));
      expect(toastId).toBeTruthy();
      expect(toastId.length).toBeGreaterThan(0);
    });

    it('should add toast to toasts array', () => {
      render(
        <ToastManagerProvider>
          <TestComponent />
        </ToastManagerProvider>
      );

      fireEvent.click(screen.getByText('Show'));
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should allow multiple toasts', () => {
      render(
        <ToastManagerProvider>
          <TestComponent />
        </ToastManagerProvider>
      );

      fireEvent.click(screen.getByText('Show'));
      fireEvent.click(screen.getByText('Show'));
      fireEvent.click(screen.getByText('Show'));

      expect(screen.getAllByText('Test')).toHaveLength(3);
    });
  });
});
```

**Test 1.1.2: useToast Convenience Hook**
```typescript
// Note: success(), error(), warning(), info(), message() are on useToast hook
const TestToastHookComponent = () => {
  const { success, error, warning, info } = useToast();

  return (
    <div>
      <button onClick={() => success('Success!')}>Success</button>
      <button onClick={() => error('Error!')}>Error</button>
      <button onClick={() => warning('Warning!')}>Warning</button>
      <button onClick={() => info('Info!')}>Info</button>
    </div>
  );
};

describe('useToast convenience methods', () => {
  it('success should create success toast', () => {
    render(
      <ToastManagerProvider>
        <TestToastHookComponent />
      </ToastManagerProvider>
    );

    fireEvent.click(screen.getByText('Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
  });

  it('error should create error toast', () => {
    render(
      <ToastManagerProvider>
        <TestToastHookComponent />
      </ToastManagerProvider>
    );

    fireEvent.click(screen.getByText('Error'));
    expect(screen.getByText('Error!')).toBeInTheDocument();
  });
});
```

**Test 1.1.3: hideToast**
```typescript
describe('hideToast', () => {
  it('should remove toast by ID', () => {
    render(
      <ToastManagerProvider>
        <TestComponent onToastId={() => {}} />
      </ToastManagerProvider>
    );
    
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText('Test')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Hide'));
    // Wait for toast to be removed
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });
});
```

**Test 1.1.4: clearToasts**
```typescript
describe('clearToasts', () => {
  it('should remove all toasts', () => {
    render(
      <ToastManagerProvider>
        <TestComponent onToastId={() => {}} />
      </ToastManagerProvider>
    );
    
    fireEvent.click(screen.getByText('Show'));
    fireEvent.click(screen.getByText('Success'));
    expect(screen.getByText('Test')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
  });
});
```

**Test 1.1.5: Auto-Dismissal**
```typescript
describe('Auto-Dismissal', () => {
  it('should auto-remove toast after duration', () => {
    vi.useFakeTimers();
    
    render(
      <ToastManagerProvider>
        <TestComponent onToastId={() => {}} />
      </ToastManagerProvider>
    );
    
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText('Test')).toBeInTheDocument();
    
    // Advance timer past duration (default 5000ms)
    vi.advanceTimersByTime(5000);
    
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });

  it('should respect custom duration', () => {
    vi.useFakeTimers();
    
    let toastId = '';
    const TestComponentWithDuration = () => {
      const { showToast } = useToastManager();
      return (
        <button onClick={() => {
          toastId = showToast({ title: 'Custom', duration: 1000 });
        }}>Show</button>
      );
    };
    
    render(
      <ToastManagerProvider>
        <TestComponentWithDuration />
      </ToastManagerProvider>
    );
    
    fireEvent.click(screen.getByText('Show'));
    vi.advanceTimersByTime(999);
    expect(screen.getByText('Custom')).toBeInTheDocument();
    
    vi.advanceTimersByTime(1);
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });
});
```

**Test 1.1.6: Context Error**
```typescript
describe('Context Errors', () => {
  it('should throw error when used outside provider', () => {
    const BadComponent = () => {
      useToastManager();
      return null;
    };
    
    expect(() => render(<BadComponent />)).toThrow();
  });
});
```

---

### 1.2 DialogManager (`components/DialogManager.tsx`)

**File Location:** `core/src/components/DialogManager.tsx`

#### Implementation Analysis

**Purpose:** Dialog/alert management system with context API

**Correct Context Interface (ACTUAL):**
```typescript
interface DialogManagerContextType {
  dialogs: DialogConfig[];
  openDialog: (config: Omit<DialogConfig, 'id'>) => string;
  closeDialog: (id: string) => void;
  closeAllDialogs: () => void;
}

interface DialogConfig {
  id: string;
  type: 'confirm' | 'alert' | 'prompt';
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'destructive';
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}
```

**NOTE:** `useConfirmDialog()` and `useAlertDialog()` are **separate hooks**, NOT methods on the context. They return functions to close the dialog, not promises.

#### Test Scenarios

**Test 1.2.1: Dialog Lifecycle**
```typescript
describe('DialogManager', () => {
  const TestDialogComponent = () => {
    const { openDialog, closeDialog } = useDialogManager();

    return (
      <div>
        <button onClick={() => openDialog({ type: 'alert', title: 'Alert!' })}>Open Alert</button>
        <button onClick={() => closeDialog('test-id')}>Close</button>
      </div>
    );
  };

  it('should open dialog with ID', () => {
    render(
      <DialogManagerProvider>
        <TestDialogComponent />
      </DialogManagerProvider>
    );

    fireEvent.click(screen.getByText('Open Alert'));
    expect(screen.getByText('Alert!')).toBeInTheDocument();
  });
});
```

**Test 1.2.2: Confirm Dialog Hook**
```typescript
describe('Confirm Dialog', () => {
  it('should call onConfirm when confirmed', async () => {
    const onConfirm = vi.fn();
    let dialogId = '';

    const TestComponent = () => {
      const { openDialog } = useDialogManager();
      return (
        <button onClick={() => {
          dialogId = openDialog({
            type: 'confirm',
            title: 'Confirm?',
            onConfirm
          });
        }}>Open</button>
      );
    };

    render(
      <DialogManagerProvider>
        <TestComponent />
      </DialogManagerProvider>
    );

    fireEvent.click(screen.getByText('Open'));
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalled();
  });

  it('useConfirmDialog should return close function', () => {
    const TestPromiseComponent = () => {
      const useConfirm = useConfirmDialog();
      const close = useConfirm({ title: 'Test', onConfirm: vi.fn() });

      return (
        <div>
          <button onClick={close}>Close</button>
        </div>
      );
    };

    render(
      <DialogManagerProvider>
        <TestPromiseComponent />
      </DialogManagerProvider>
    );

    // useConfirmDialog returns a function to close the dialog
    expect(typeof useConfirmDialog().length).toBe(0); // takes 1 param
  });
});
```

---

### 1.3 DynamicSidebarProvider (`components/dynamic-sidebar/DynamicSidebarProvider.tsx`)

**File Location:** `core/src/components/dynamic-sidebar/DynamicSidebarProvider.tsx`

#### Implementation Analysis

**Purpose:** Sidebar state management with localStorage persistence

**Correct Context Interface (ACTUAL):**
```typescript
interface DynamicSidebarContextValue {
  header: DynamicSidebarHeaderConfig | null;
  menuItems: DynamicSidebarMenuItemConfig[];
  footerItems: ReactNode[];
  isOpen: boolean;
  setHeader: (header: DynamicSidebarHeaderConfig | null) => void;
  setMenuItems: (items: DynamicSidebarMenuItemConfig[]) => void;
  addMenuItem: (item: DynamicSidebarMenuItemConfig, index?: number) => void;
  removeMenuItem: (id: string) => void;
  updateMenuItem: (id: string, item: Partial<DynamicSidebarMenuItemConfig>) => void;
  addFooterItem: (item: ReactNode, index?: number) => void;
  clearFooterItems: () => void;
  setIsOpen: (open: boolean) => void;
  toggle: () => void;
  reset: () => void;
}
```

#### Test Scenarios

**Test 1.3.1: State Persistence**
```typescript
describe('DynamicSidebarProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should load state from localStorage', () => {
    localStorage.setItem('bernard-sidebar-state', JSON.stringify({ isOpen: false }));
    
    render(
      <DynamicSidebarProvider>
        <TestSidebarConsumer />
      </DynamicSidebarProvider>
    );
    
    // Verify isOpen matches localStorage
  });

  it('should save state to localStorage on change', () => {
    render(
      <DynamicSidebarProvider>
        <TestSidebarConsumer />
      </DynamicSidebarProvider>
    );
    
    const toggleButton = screen.getByText('Toggle');
    fireEvent.click(toggleButton);
    
    const saved = localStorage.getItem('bernard-sidebar-state');
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!).isOpen).toBe(false);
  });
});
```

**Test 1.3.2: Toggle**
```typescript
describe('toggle', () => {
  it('should invert isOpen state', () => {
    render(
      <DynamicSidebarProvider>
        <TestSidebarConsumer />
      </DynamicSidebarProvider>
    );
    
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
    
    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
    
    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
  });
});
```

**Test 1.3.3: Menu Items**
```typescript
describe('Menu Items', () => {
  it('should add menu item', () => {
    render(
      <DynamicSidebarProvider>
        <TestSidebarConsumer />
      </DynamicSidebarProvider>
    );
    
    fireEvent.click(screen.getByText('Add Item'));
    expect(screen.getByText('Test Item')).toBeInTheDocument();
  });

  it('should remove menu item by ID', () => {
    render(
      <DynamicSidebarProvider>
        <TestSidebarConsumer />
      </DynamicSidebarProvider>
    );
    
    fireEvent.click(screen.getByText('Add Item'));
    expect(screen.getByText('Test Item')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.queryByText('Test Item')).not.toBeInTheDocument();
  });
});
```

**Test 1.3.4: Reset**
```typescript
describe('reset', () => {
  it('should clear all state', () => {
    render(
      <DynamicSidebarProvider>
        <TestSidebarConsumer />
      </DynamicSidebarProvider>
    );
    
    // Modify state
    fireEvent.click(screen.getByText('Add Item'));
    fireEvent.click(screen.getByText('Toggle'));
    
    // Reset
    fireEvent.click(screen.getByText('Reset'));
    
    // Verify reset state
    expect(screen.queryByText('Test Item')).not.toBeInTheDocument();
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
  });
});
```

---

### 1.4 DynamicHeaderProvider (`components/dynamic-header/DynamicHeaderProvider.tsx`)

**File Location:** `core/src/components/dynamic-header/DynamicHeaderProvider.tsx`

#### Implementation Analysis

**Purpose:** Header state management (title, subtitle, actions)

**Correct Context Interface (ACTUAL):**
```typescript
interface DynamicHeaderContextValue {
  title: string;
  subtitle: string | null;
  actions: DynamicHeaderAction[];
  setTitle: (title: string) => void;
  setSubtitle: (subtitle: string | null) => void;
  setActions: (actions: DynamicHeaderAction[]) => void;
  reset: () => void;
}
```

**NOTE:** `actions` is an array of `DynamicHeaderAction[]`, not `React.ReactNode`

#### Test Scenarios

**Test 1.4.1: Title Management**
```typescript
describe('DynamicHeaderProvider', () => {
  it('should set title', () => {
    render(
      <DynamicHeaderProvider>
        <TestHeaderConsumer />
      </DynamicHeaderProvider>
    );
    
    fireEvent.click(screen.getByText('Set Title'));
    expect(screen.getByTestId('title')).toHaveTextContent('New Title');
  });

  it('should set subtitle', () => {
    render(
      <DynamicHeaderProvider>
        <TestHeaderConsumer />
      </DynamicHeaderProvider>
    );
    
    fireEvent.click(screen.getByText('Set Subtitle'));
    expect(screen.getByTestId('subtitle')).toHaveTextContent('Subtitle Text');
  });

  it('should clear subtitle with null', () => {
    render(
      <DynamicHeaderProvider>
        <TestHeaderConsumer />
      </DynamicHeaderProvider>
    );
    
    // Set subtitle first
    fireEvent.click(screen.getByText('Set Subtitle'));
    // Clear it
    fireEvent.click(screen.getByText('Clear Subtitle'));
    expect(screen.queryByTestId('subtitle')).not.toBeInTheDocument();
  });

  it('should set actions', () => {
    render(
      <DynamicHeaderProvider>
        <TestHeaderConsumer />
      </DynamicHeaderProvider>
    );
    
    fireEvent.click(screen.getByText('Set Actions'));
    expect(screen.getByText('Action Button')).toBeInTheDocument();
  });

  it('should reset to defaults', () => {
    render(
      <DynamicHeaderProvider>
        <TestHeaderConsumer />
      </DynamicHeaderProvider>
    );
    
    // Modify state
    fireEvent.click(screen.getByText('Set Title'));
    fireEvent.click(screen.getByText('Set Subtitle'));
    
    // Reset
    fireEvent.click(screen.getByText('Reset'));
    
    expect(screen.getByTestId('title')).toHaveTextContent('Bernard');
    expect(screen.getByTestId('subtitle')).toHaveTextContent('AI Assistant');
  });
});
```

---

## Phase 2: Layout Components Testing (P1)

### 2.1 ProtectedRoute (`components/ProtectedRoute.tsx`)

**File Location:** `core/src/components/ProtectedRoute.tsx`

#### Implementation Analysis

**Purpose:** Route guard with optional admin requirement

**Props:**
```typescript
{
  children: React.ReactNode;
  requireAdmin?: boolean;
}
```

**Behavior:**
- Loading state while auth checks (uses `state.loading`)
- Redirect to `/auth/login` if unauthenticated (uses `window.location.href`)
- Redirect to home (`/`) if not admin (when requireAdmin=true)
- Render children if authorized

**NOTE:** Uses `useAuth()` hook with `state.loading`, `state.user`, `state.user.role` - NO test IDs in UI

#### Test Scenarios

**Test 2.1.1: Loading State**
```typescript
// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    state: { user: null, loading: true },
  }),
}));

describe('ProtectedRoute', () => {
  it('should show loading spinner while auth loading', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // No test ID - use role selector
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
```

**Test 2.1.2: Unauthenticated Redirect**
```typescript
// Mock useAuth for unauthenticated user
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    state: { user: null, loading: false },
  }),
}));

// Mock window.location.href
const originalHref = window.location.href;
delete (window as any).location;
(window as any).location = { href: '', pathname: '/test' };

describe('Unauthenticated', () => {
  it('should redirect to login when unauthenticated', () => {
    // Mock useRouter
    const replaceMock = vi.fn();
    vi.mocked(require('next/navigation').useRouter).mockReturnValue({
      replace: replaceMock,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(replaceMock).toHaveBeenCalledWith('/');
    expect(window.location.href).toContain('/auth/login');
  });
});
```

**Test 2.1.3: Non-Admin Redirect**
```typescript
// Mock useAuth for non-admin user
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    state: { user: { id: '1', role: 'user' }, loading: false },
  }),
}));

describe('Non-Admin', () => {
  it('should redirect to home when user is not admin', () => {
    const replaceMock = vi.fn();
    vi.mocked(require('next/navigation').useRouter).mockReturnValue({
      replace: replaceMock,
    });

    render(
      <ProtectedRoute requireAdmin>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    expect(replaceMock).toHaveBeenCalledWith('/');
  });
});
```

**Test 2.1.4: Admin Access**
```typescript
// Mock useAuth for admin user
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    state: { user: { id: '1', role: 'admin' }, loading: false },
  }),
}));

describe('Admin Access', () => {
  it('should render children for admin user', () => {
    render(
      <ProtectedRoute requireAdmin>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});

describe('User Access', () => {
  it('should render children for regular user', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
```

---

### 2.2 AdminLayout (`components/AdminLayout.tsx`)

**File Location:** `core/src/components/AdminLayout.tsx`

#### Implementation Analysis

**Purpose:** Admin-only layout wrapper with context providers

**Structure:**
```
AdminLayout
├── AuthProvider
├── DarkModeProvider
├── DialogManagerProvider
├── ToastManagerProvider
├── AdminLayoutContent (uses useAdminAuth)
│   ├── Loading: "Checking admin privileges..."
│   ├── Access Denied: Card with Back button
│   └── Content wrapped in:
│       ├── AdminSidebarConfig
│       └── PageHeaderConfig (title="Admin Panel")
```

**Dependencies:**
- useAdminAuth - Admin check with `isAdminLoading`, `isAdmin`
- AuthProvider, DarkModeProvider, ToastManagerProvider, DialogManagerProvider
- AdminSidebarConfig, PageHeaderConfig

#### Test Scenarios

**Test 2.2.1: Loading State**
```typescript
// Mock useAdminAuth
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({
    isAdminLoading: true,
    isAdmin: false,
  }),
}));

describe('AdminLayout', () => {
  it('should show loading while checking admin', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByText('Checking admin privileges...')).toBeInTheDocument();
  });
});
```

**Test 2.2.2: Access Denied**
```typescript
// Mock useAdminAuth for non-admin
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({
    isAdminLoading: false,
    isAdmin: false,
  }),
}));

describe('Access Denied', () => {
  it('should show access denied for non-admin', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText("You don't have admin privileges to access this area.")).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(screen.getByText('Back to Home')).toBeInTheDocument();
  });
});
```

**Test 2.2.3: Admin Access**
```typescript
// Mock useAdminAuth for admin
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({
    isAdminLoading: false,
    isAdmin: true,
  }),
}));

describe('Admin Access', () => {
  it('should render content for admin user', () => {
    render(
      <AdminLayout>
        <div>Admin Content</div>
      </AdminLayout>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });
});
```

---

### 2.3 UserLayout (`components/UserLayout.tsx`)

**File Location:** `core/src/components/UserLayout.tsx`

#### Test Scenarios

**Test 2.3.1: Dark Mode Integration**
```typescript
describe('UserLayout', () => {
  it('should apply dark class when dark mode enabled', () => {
    // Mock useDarkMode to return { isDarkMode: true }
    
    render(
      <UserLayout>
        <div>User Content</div>
      </UserLayout>
    );
    
    expect(document.documentElement).toHaveClass('dark');
  });

  it('should not apply dark class when dark mode disabled', () => {
    // Mock useDarkMode to return { isDarkMode: false }
    
    render(
      <UserLayout>
        <div>User Content</div>
      </UserLayout>
    );
    
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
```

---

## Phase 3: Dashboard Components Testing (P1)

### 3.1 ServiceList (`components/dashboard/ServiceList.tsx`)

**File Location:** `core/src/components/dashboard/ServiceList.tsx`

#### Implementation Analysis

**Purpose:** Grid of all service status cards

**Dependencies:**
- useServiceStatus hook - Fetches service statuses
- ServiceCard component

**State:**
- statuses[] - Service statuses
- loading - Fetch state
- error - Error state

#### Test Scenarios

**Test 3.1.1: Loading State**
```typescript
describe('ServiceList', () => {
  it('should show loading skeleton', () => {
    // Mock useServiceStatus to return { loading: true, statuses: [], error: null }
    
    render(<ServiceList />);
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });
});
```

**Test 3.1.2: Error State**
```typescript
describe('Error State', () => {
  it('should show error with retry button', () => {
    // Mock useServiceStatus to return { loading: false, statuses: [], error: 'Connection failed' }
    
    render(<ServiceList />);
    
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should retry on button click', () => {
    const refresh = vi.fn();
    // Mock useServiceStatus to return { loading: false, statuses: [], error: 'Error', refresh }
    
    render(<ServiceList />);
    
    fireEvent.click(screen.getByText('Retry'));
    expect(refresh).toHaveBeenCalled();
  });
});
```

**Test 3.1.3: Service Cards Rendering**
```typescript
describe('Service Rendering', () => {
  it('should render ServiceCard for each status', () => {
    const mockStatuses = [
      { id: 'whisper', name: 'Whisper', status: 'running', health: 'healthy' },
      { id: 'kokoro', name: 'Kokoro', status: 'stopped', health: 'unknown' }
    ];
    // Mock useServiceStatus to return { loading: false, statuses: mockStatuses, error: null }
    
    render(<ServiceList />);
    
    expect(screen.getByText('Whisper')).toBeInTheDocument();
    expect(screen.getByText('Kokoro')).toBeInTheDocument();
  });

  it('should show running count', () => {
    const mockStatuses = [
      { id: 'whisper', name: 'Whisper', status: 'running' },
      { id: 'kokoro', name: 'Kokoro', status: 'stopped' },
      { id: 'bernard', name: 'Bernard', status: 'running' }
    ];
    // Mock useServiceStatus
    
    render(<ServiceList />);
    
    expect(screen.getByText('2 running')).toBeInTheDocument();
  });
});
```

---

### 3.2 ServiceCard (`components/dashboard/ServiceCard.tsx`)

**File Location:** `core/src/components/dashboard/ServiceCard.tsx`

#### Test Scenarios

**Test 3.2.1: Status Display**
```typescript
describe('ServiceCard', () => {
  it('should show running status with green indicator', () => {
    // Mock useService to return { status: 'running', health: 'healthy' }
    
    render(<ServiceCard serviceId="whisper" />);
    
    expect(screen.getByTestId('status-running')).toBeInTheDocument();
    expect(screen.getByTestId('health-healthy')).toBeInTheDocument();
  });

  it('should show stopped status with red indicator', () => {
    // Mock useService to return { status: 'stopped', health: 'unknown' }
    
    render(<ServiceCard serviceId="kokoro" />);
    
    expect(screen.getByTestId('status-stopped')).toBeInTheDocument();
  });

  it('should show starting status with yellow indicator', () => {
    // Mock useService to return { status: 'starting', health: 'unknown' }
    
    render(<ServiceCard serviceId="test" />);
    
    expect(screen.getByTestId('status-starting')).toBeInTheDocument();
  });
});
```

**Test 3.2.2: Uptime Display**
```typescript
describe('Uptime', () => {
  it('should format uptime correctly', () => {
    // Mock useService to return { status: 'running', uptime: 3600 }
    
    render(<ServiceCard serviceId="whisper" />);
    
    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('should show days for long uptime', () => {
    // Mock useService to return { status: 'running', uptime: 90000 }
    
    render(<ServiceCard serviceId="whisper" />);
    
    expect(screen.getByText('1d 1h')).toBeInTheDocument();
  });
});
```

---

### 3.3 LogViewer (`components/dashboard/LogViewer.tsx`)

**File Location:** `core/src/components/dashboard/LogViewer.tsx`

#### Implementation Analysis

**Purpose:** Real-time log display with filtering

**Dependencies:**
- useLogStream hook - SSE log streaming
- Service parameter

**Features:**
- Log filtering by level and search term
- Auto-scroll on new logs
- Clear logs functionality

#### Test Scenarios

**Test 3.3.1: Log Display**
```typescript
describe('LogViewer', () => {
  it('should display log entries', () => {
    const mockLogs = [
      { timestamp: '2024-01-01T00:00:00Z', level: 'info', service: 'core', message: 'Started' },
      { timestamp: '2024-01-01T00:00:01Z', level: 'error', service: 'core', message: 'Failed' }
    ];
    // Mock useLogStream to return { logs: mockLogs, isConnected: true, error: null, clearLogs }
    
    render(<LogViewer service="core" />);
    
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('should filter logs by level', () => {
    const mockLogs = [
      { timestamp: '2024-01-01T00:00:00Z', level: 'info', service: 'core', message: 'Info msg' },
      { timestamp: '2024-01-01T00:00:01Z', level: 'error', service: 'core', message: 'Error msg' }
    ];
    // Mock useLogStream
    
    render(<LogViewer service="core" />);
    
    // Click filter button to show only errors
    fireEvent.click(screen.getByLabelText('Filter errors'));
    
    expect(screen.getByText('Error msg')).toBeInTheDocument();
    expect(screen.queryByText('Info msg')).not.toBeInTheDocument();
  });

  it('should search logs', () => {
    const mockLogs = [
      { timestamp: '2024-01-01T00:00:00Z', level: 'info', service: 'core', message: 'User login' },
      { timestamp: '2024-01-01T00:00:01Z', level: 'info', service: 'core', message: 'User logout' }
    ];
    // Mock useLogStream
    
    render(<LogViewer service="core" />);
    
    // Type in search
    const searchInput = screen.getByPlaceholderText('Search logs...');
    fireEvent.change(searchInput, { target: { value: 'login' } });
    
    expect(screen.getByText('User login')).toBeInTheDocument();
    expect(screen.queryByText('User logout')).not.toBeInTheDocument();
  });
});
```

**Test 3.3.2: Connection Status**
```typescript
describe('Connection Status', () => {
  it('should show connected status', () => {
    // Mock useLogStream to return { logs: [], isConnected: true, error: null }
    
    render(<LogViewer service="core" />);
    
    expect(screen.getByTestId('connection-connected')).toBeInTheDocument();
  });

  it('should show disconnected status', () => {
    // Mock useLogStream to return { logs: [], isConnected: false, error: null }
    
    render(<LogViewer service="core" />);
    
    expect(screen.getByTestId('connection-disconnected')).toBeInTheDocument();
  });

  it('should show error status', () => {
    // Mock useLogStream to return { logs: [], isConnected: false, error: 'Connection lost' }
    
    render(<LogViewer service="core" />);
    
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
  });
});
```

---

### 3.4 CombinedLogs (`components/dashboard/CombinedLogs.tsx`)

**File Location:** `core/src/components/dashboard/CombinedLogs.tsx`

#### Test Scenarios

**Test 3.4.1: Service Filter**
```typescript
describe('CombinedLogs', () => {
  it('should filter by service', () => {
    // Mock LogViewer to show all logs
    // Service filter dropdown should filter to specific service
    
    render(<CombinedLogs />);
    
    const serviceSelect = screen.getByLabelText('Service');
    fireEvent.change(serviceSelect, { target: { value: 'whisper' } });
    
    // Verify LogViewer receives correct service prop
  });

  it('should have All Services option', () => {
    render(<CombinedLogs />);
    
    expect(screen.getByText('All Services')).toBeInTheDocument();
  });
});
```

---

### 3.5 ServicePageClient (`components/dashboard/ServicePageClient.tsx`)

**File Location:** `core/src/components/dashboard/ServicePageClient.tsx`

#### Test Scenarios

**Test 3.5.1: Service Actions**
```typescript
describe('ServicePageClient', () => {
  it('should disable start button when already running', () => {
    // Mock useService to return { status: 'running', loading: false }
    
    render(<ServicePageClient />);
    
    expect(screen.getByText('Start')).toBeDisabled();
    expect(screen.getByText('Stop')).not.toBeDisabled();
  });

  it('should show loading during action', async () => {
    const mockStart = vi.fn().mockImplementation(() => new Promise(r => setTimeout(r, 100)));
    // Mock useService to return { status: 'stopped', loading: false, start: mockStart }
    
    render(<ServicePageClient />);
    
    fireEvent.click(screen.getByText('Start'));
    expect(screen.getByTestId('action-loading')).toBeInTheDocument();
    
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
  });
});
```

---

## Phase 4: Dynamic Sidebar Components (P2)

### 4.1 DynamicSidebar (`components/dynamic-sidebar/DynamicSidebar.tsx`)

**Test Scenarios**

**Test 4.1.1: Animation**
```typescript
describe('DynamicSidebar', () => {
  it('should animate width on toggle', () => {
    // Mock useDynamicSidebar to return { isOpen: true }
    
    render(<DynamicSidebar />);
    
    // Verify sidebar is expanded
    expect(screen.getByTestId('sidebar-expanded')).toBeInTheDocument();
    
    // Toggle
    fireEvent.click(screen.getByText('Toggle'));
    
    // Verify collapsed
    expect(screen.getByTestId('sidebar-collapsed')).toBeInTheDocument();
  });

  it('should show backdrop on mobile when open', () => {
    // Mock window.innerWidth to mobile
    // Mock useDynamicSidebar to return { isOpen: true }
    
    render(<DynamicSidebar />);
    
    expect(screen.getByTestId('mobile-backdrop')).toBeInTheDocument();
  });
});
```

---

### 4.2 DynamicSidebarMenuItem (`components/dynamic-sidebar/DynamicSidebarMenuItem.tsx`)

**Test Scenarios**

**Test 4.2.1: Active State**
```typescript
describe('DynamicSidebarMenuItem', () => {
  it('should show active state when pathname matches', () => {
    // Mock usePathname to return '/bernard/chat'
    // Render menu item with href='/bernard/chat'
    
    expect(screen.getByTestId('menu-item')).toHaveClass('active');
  });

  it('should show inactive state when pathname does not match', () => {
    // Mock usePathname to return '/bernard/admin'
    // Render menu item with href='/bernard/chat'
    
    expect(screen.getByTestId('menu-item')).not.toHaveClass('active');
  });

  it('should handle disabled state', () => {
    // Render menu item with isDisabled=true
    
    expect(screen.getByTestId('menu-item')).toHaveClass('disabled');
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

---

## Phase 5: UI Primitives (P2)

### 5.1 Alert (`components/ui/alert.tsx`)

**Test Scenarios**

**Test 5.1.1: Variants**
```typescript
describe('Alert', () => {
  it('should render default variant', () => {
    render(<Alert variant="default"><AlertTitle>Title</AlertTitle></Alert>);
    
    expect(screen.getByTestId('alert-default')).toBeInTheDocument();
  });

  it('should render destructive variant', () => {
    render(<Alert variant="destructive"><AlertTitle>Error</AlertTitle></Alert>);
    
    expect(screen.getByTestId('alert-destructive')).toBeInTheDocument();
  });
});
```

---

### 5.2 Badge (`components/ui/badge.tsx`)

**Test Scenarios**

```typescript
describe('Badge', () => {
  it('should render all variants', () => {
    const variants = ['default', 'secondary', 'destructive', 'outline'];
    
    variants.forEach(variant => {
      render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
    });
  });
});
```

---

### 5.3 Card (`components/ui/card.tsx`)

**Test Scenarios**

```typescript
describe('Card', () => {
  it('should render all sub-components', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });
});
```

---

### 5.4 Dialog (`components/ui/dialog.tsx`)

**Test Scenarios**

**Test 5.4.1: Variants**
```typescript
describe('Dialog', () => {
  const variants = ['default', 'success', 'warning', 'error', 'info'];
  
  variants.forEach(variant => {
    it(`should render ${variant} variant`, () => {
      render(
        <AlertDialog open>
          <AlertDialogContent variant={variant}>
            <AlertDialogTitle>Test</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );
      
      expect(screen.getByTestId(`dialog-${variant}`)).toBeInTheDocument();
    });
  });
});
```

**Test 5.4.2: Timeout**
```typescript
describe('Dialog Timeout', () => {
  it('should close after timeout', () => {
    vi.useFakeTimers();
    
    render(
      <AlertDialog open timeout={5000}>
        <AlertDialogContent>
          <AlertDialogTitle>Test</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    );
    
    vi.advanceTimersByTime(5000);
    
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });
});
```

---

## Mock Infrastructure

> **Note:** Shared test infrastructure (mocks, wrappers, helpers) is defined in [tasks-0.plan.md](tasks-0.plan.md). All tests in this plan use the centralized mock infrastructure.

### Existing Test Pattern (Follow This)

The codebase uses a specific pattern with `vi.hoisted()` for mock contexts. **All component tests should follow this pattern:**

```typescript
// core/src/test/wrappers/component-wrappers.tsx
import { ReactNode } from 'react';
import { vi } from 'vitest';

// HOISTED MOCK CONTEXT (must be hoisted at module level)
const mockContext = vi.hoisted(() => ({
  messages: [],
  isLoading: false,
  submit: vi.fn(),
  stop: vi.fn(),
}));

// MOCK BEFORE IMPORTS (must be hoisted)
vi.mock('../../../providers/StreamProvider', async () => {
  const actual = await vi.importActual('../../../providers/StreamProvider');
  return {
    ...actual,
    useStreamContext: () => mockContext,
  };
});

// Component tests...
```

### Component Test Wrappers

```typescript
// core/src/test/wrappers/component-wrappers.tsx
import { ReactNode } from 'react';
import { vi } from 'vitest';

export const createAuthContext = (overrides = {}) => ({
  user: null,
  loading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  clearError: vi.fn(),
  ...overrides,
});

export const createAdminAuthContext = (overrides = {}) => ({
  isAdmin: true,
  isAdminLoading: false,
  user: { id: 'admin', role: 'admin' },
  ...overrides,
});

export const createDarkModeContext = (overrides = {}) => ({
  isDarkMode: false,
  toggleDarkMode: vi.fn(),
  ...overrides,
});

export const createSidebarContext = (overrides = {}) => ({
  isOpen: true,
  header: null,
  menuItems: [],
  footerItems: [],
  setHeader: vi.fn(),
  setMenuItems: vi.fn(),
  addMenuItem: vi.fn(),
  removeMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  addFooterItem: vi.fn(),
  clearFooterItems: vi.fn(),
  setIsOpen: vi.fn(),
  toggle: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});

export const createHeaderContext = (overrides = {}) => ({
  title: 'Bernard',
  subtitle: null,
  actions: [],
  setTitle: vi.fn(),
  setSubtitle: vi.fn(),
  setActions: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});
```

---

## Execution Order

> **Note:** Shared test infrastructure (mocks, wrappers, helpers) is defined in [tasks-0.plan.md](tasks-0.plan.md). All tests in this plan use the centralized mock infrastructure.

### Priority Sequence

1. **Phase 1: Context Providers** (Foundation for all components)
   - ToastManager (most used)
   - DialogManager
   - DynamicSidebarProvider
   - DynamicHeaderProvider

2. **Phase 2: Layout Components** (Auth guards, routing)
   - ProtectedRoute
   - AdminLayout
   - UserLayout

3. **Phase 3: Dashboard Components** (API integration)
   - ServiceList
   - ServiceCard
   - LogViewer
   - CombinedLogs
   - ServicePageClient

4. **Phase 4: Dynamic Sidebar** (State consumers)
   - DynamicSidebar
   - DynamicSidebarMenuItem
   - Other sidebar components

5. **Phase 5: UI Primitives** (Simple rendering tests)
   - Alert, Badge, Card, Dialog, etc.

---

## Coverage Targets

| Component Category | Files | Current | Target | Notes |
|-------------------|-------|---------|--------|-------|
| Context Providers | 6 | 0-25% | 90% | Toast, Dialog, Sidebar, Header |
| Layout Components | 4 | 0% | 90% | Protected, Admin, User layouts |
| Dashboard Components | 5 | 0% | 90% | ServiceList, ServiceCard, LogViewer |
| Dynamic Sidebar | 6 | 0% | 85% | Provider, Sidebar, MenuItem, etc. |
| Dynamic Header | 2 | 0% | 85% | Provider, Context |
| UI Primitives | 15+ | 0-72% | 85% | Alert, Badge, Card, Dialog, etc. |
| **Chat Components** | 9 | **Existing** | N/A | Pre-existing tests (not counted) |

### Estimated Test Count

| Category | Estimated Tests |
|----------|-----------------|
| Context Providers | ~35 tests |
| Layout Components | ~20 tests |
| Dashboard Components | ~30 tests |
| Dynamic Sidebar | ~20 tests |
| Dynamic Header | ~10 tests |
| UI Primitives | ~35 tests |
| **Total** | **~150 new tests** |

---

## Identified Gaps & Missing Components

The following components/components were identified but **NOT covered in this plan**:

### Missing Context Providers
- **DarkModeProvider** - Used by UserLayout, needs testing
- **AuthProvider** - Core auth context, may be in separate auth testing plan

### Missing UI Primitives (expand from current 4 to cover all)
- Button, Input, Textarea, Avatar
- Tooltip, DropdownMenu, Sheet
- Popover, ScrollArea, Separator
- Switch, Skeleton, Card variants
- ServiceTestButton, Toast (ui)

### Missing Dynamic Sidebar Components
- DynamicSidebarContext - Already exists, should test
- DynamicSidebarContent, Header, Footer - Need tests
- Config files: AdminSidebarConfig, UserSidebarConfig, ChatSidebarConfig

### Missing Chat Components (consider for future)
- BernardHeader, BernardLayoutContent
- TypedText, MarkdownText, TooltipIconButton
- ErrorState (has test), BranchSwitcher (has test)

### Missing Dashboard Components
- StatusDashboard, ServiceStatusPanel, UserBadge
- CombinedLogs (has outline), ServicePageClient (has outline)

---

## Success Criteria

### Coverage Goals

- **Context Providers:** 90% (affects all child components)
- **Layout Components:** 90% (auth guards are critical)
- **Dashboard Components:** 90% (user-facing functionality)
- **UI Primitives:** 85% (simple rendering tests)
- **Pre-existing Chat Tests:** Preserve existing coverage

### Test Quality

All component tests must:
1. Follow existing `vi.hoisted()` mock pattern for context providers
2. Render without errors
3. Handle props correctly
4. Respond to user interactions
5. Show loading/error states
6. Clean up after unmount

---

## Next Steps

1. **Create component test wrappers** with proper context mocks
2. **Set up RTL with required mocks** following existing patterns
3. **Execute tests in priority order** (P0 → P2)
4. **Verify coverage improvements**
5. **Add DarkModeProvider tests** (currently missing)
6. **Expand UI primitives** beyond Alert/Badge/Card/Dialog
7. **Move to Tasks D for hooks** (useServiceStatus, useLogStream, etc.)

**End of Tasks C**
