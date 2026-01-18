# Bernard Testing Improvements - Tasks A: Auth, User & Layout Pages
**Generated:** 2026-01-18
**Target Coverage:** 70% overall (currently ~20%)
**Focus Areas:** Auth Pages, User Pages, Layout Components

## Executive Summary

This plan addresses authentication, user management, and layout components. After reviewing actual implementation, several discrepancies were found between the plan and code:

**Key Findings:**
- LoginPage uses `authClient` directly, NOT `useAuth` hook
- `useAuth.clearError()` is a no-op (Better-Auth handles errors as exceptions)
- `useAuth.updateProfile()` returns cached user, not server response
- `UserSectionLayout` redirects only `role === 'guest'` users
- AdminLayout wraps with 5 nested providers (Auth, DarkMode, Dialog, Toast, SidebarConfig)
- No auth mocks exist in `core/src/test/mocks/` (16 other mocks do exist)

**Action Required Before Testing:**
1. Update `authContextContainer.ts` mock to match real implementation (remove `getCurrentUser`, add `role` field)
2. Create `core/src/test/mocks/auth.ts` for `authClient` mocking
3. Add error handling to logout page implementation (tests cover this gap)

## Files Covered in This Plan

| File | Current | Complexity | Priority | Notes |
|------|---------|------------|----------|-------|
| `app/(dashboard)/auth/login/page.tsx` | 0% | Medium | P0 | Uses authClient directly |
| `app/(dashboard)/auth/logout/page.tsx` | 0% | Low | P0 | No error handling |
| `app/(dashboard)/bernard/user/layout.tsx` | 0% | Low | P1 | Guest redirect logic |
| `app/(dashboard)/bernard/user/profile/page.tsx` | 0% | Medium | P1 | Form + reset + messages |
| `app/(dashboard)/bernard/user/tokens/page.tsx` | 0% | Medium | P1 | API client + dialogs |
| `components/UserLayout.tsx` | 0% | Low | P2 | Theme + providers |
| `components/AdminLayout.tsx` | 0% | Medium | P2 | 5 nested providers |
| `hooks/useAuth.ts` | 0% | High | P0 | Core auth, fallback logic |
| `hooks/useAdminAuth.ts` | 0% | Low | P2 | Derived state wrapper |
| `lib/auth/auth-client.ts` | 0% | Low | P1 | Single export |
| `lib/auth/auth.ts` | 34.54% | Medium | P1 | Better-Auth config |

---

## Phase 1: Authentication Pages Testing

### 1.1 `/auth/login/page.tsx` - Login/Signup Form (0% coverage)

**File Location:** `core/src/app/(dashboard)/auth/login/page.tsx`

#### Implementation Analysis

**CRITICAL**: This component does NOT use `useAuth`. It directly calls `authClient` methods.

The login page is a dual-mode authentication form supporting both email-based login and signup with automatic mode switching. It integrates with Better-Auth via the `authClient` module and provides real-time validation feedback.

**Key Components:**
- Main `LoginPage` default export component
- State management for email, password, isSignUp toggle, and error states
- Form submission handler with async auth operations
- Toggle mechanism for switching between login and signup modes

**Data Flow:**
1. User enters credentials and submits form
2. `handleSubmit` calls `authClient.signIn.email()` or `authClient.signUp.email()`
3. On success, redirects using `useRouter` with `useSearchParams` for redirect destination (defaults to `/bernard/chat`)
4. On error, displays error message through state

**Dependencies:**
- `@/lib/auth/auth-client` - authClient methods (NOT useAuth)
- `react` - useState, useCallback
- `next/navigation` - useRouter, useSearchParams
- UI components from `@/components/ui/*`

**Key Observations:**
- No loading state during async operations
- No form validation beyond HTML `required` attribute
- Password autofill may be limited (no `name` attributes on inputs)
- Name extracted from email prefix during signup (`email.split("@")[0]`)

#### Test Scenarios

**Test 1.1.1: Successful Login Flow**
```typescript
// ⚠️ CRITICAL: Mock authClient, NOT useAuth
vi.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

describe('LoginPage', () => {
  describe('Successful Authentication', () => {
    it('should login with valid credentials', async () => {
      // Mock authClient.signIn.email to resolve
      // Fill email and password fields
      // Submit form
      // Verify router.push called with '/bernard/chat'
    });

    it('should login and redirect to custom path from URL', async () => {
      // Mock useSearchParams to return ?redirectTo=/custom/path
      // Login with valid credentials
      // Verify redirect goes to /custom/path
    });
  });
});
```

**Test 1.1.2: Successful Signup Flow**
```typescript
describe('Signup Mode', () => {
  it('should create account with name derived from email prefix', async () => {
    // Toggle to signup mode
    // Fill email "john.doe@example.com"
    // Submit form
    // Verify authClient.signUp.email called with name: "john.doe"
  });

  it('should toggle between login and signup modes', async () => {
    // Initial state should be login mode
    // Click toggle button
    // Verify isSignUp state changes
  });
});
```

**Test 1.1.3: Validation Errors**
```typescript
describe('Validation', () => {
  it('should show error for empty email', async () => {
    // Leave email empty
    // Submit form
    // Verify HTML5 validation prevents submit
  });

  it('should show error for empty password', async () => {
    // Fill email, leave password empty
    // Submit form
    // Verify HTML5 validation prevents submit
  });
});
```

**Test 1.1.4: Authentication Failures**
```typescript
describe('Authentication Failures', () => {
  it('should display error for invalid credentials', async () => {
    // Mock authClient.signIn.email to reject with error
    // Submit form
    // Verify error message displayed
  });

  it('should clear error when toggling modes', async () => {
    // Trigger login error
    // Verify error displayed
    // Toggle to signup mode
    // Verify error cleared
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `authClient.signIn.email` | Login API | MockImplementation returning Promise |
| `authClient.signUp.email` | Signup API | MockImplementation returning Promise |
| `useRouter` | Navigation | Mock with pushSpy |
| `useSearchParams` | URL params | Mock return value |

---

### 1.2 `/auth/logout/page.tsx` - Logout Handler (0% coverage)

**File Location:** `core/src/app/(dashboard)/auth/logout/page.tsx`

#### Implementation Analysis

The logout page is a minimal component that automatically triggers logout on mount and displays a loading indicator. It serves as a dedicated logout endpoint for proper session termination.

**Key Components:**
- `LogoutPage` default export
- `useEffect` for automatic logout trigger
- Loading spinner with "Signing out..." text
- `useRouter` for post-logout redirect via callback

**Data Flow:**
1. Component mounts
2. `useEffect` calls `authClient.signOut()` with callback
3. Callback redirects to `/auth/login`
4. Loading spinner shown during process

**Critical Gap**: No error handling for signOut failures. If signOut fails, user stays logged in with no feedback.

#### Test Scenarios

**Test 1.2.1: Auto-Logout on Mount**
```typescript
describe('LogoutPage', () => {
  describe('Auto Logout', () => {
    it('should call signOut on mount', async () => {
      // Render component
      // Verify authClient.signOut called
    });

    it('should only call signOut once', async () => {
      // Render component
      // Wait for effect
      // Verify signOut called exactly once
    });
  });
});
```

**Test 1.2.2: Loading State**
```typescript
describe('Loading State', () => {
  it('should display loading spinner', () => {
    // Render component
    // Verify spinner visible
  });

  it('should show signing out text', () => {
    // Render component
    // Verify "Signing out..." text visible
  });
});
```

**Test 1.2.3: Success Redirect**
```typescript
describe('Success Redirect', () => {
  it('should redirect to /auth/login on success', async () => {
    // Mock authClient.signOut with callback
    // Render component
    // Wait for signOut
    // Verify router.push called with /auth/login
  });
});
```

**Test 1.2.4: Error Handling (NEW - Critical Gap)**
```typescript
describe('Error Handling', () => {
  it('should NOT crash if signOut rejects', async () => {
    // Mock authClient.signOut to reject
    // Render component
    // Verify no uncaught exception
    // Verify component still renders loading state
  });

  it('should log error for debugging', async () => {
    // Mock authClient.signOut to reject with error
    // Render component
    // Verify console.error or logger called (if exists)
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `authClient.signOut` | Logout API | Mock with callback capture, test rejection scenarios |

---

## Phase 2: User Profile & Tokens Testing

### 2.1 `/bernard/user/profile/page.tsx` - User Profile Form (0% coverage)

**File Location:** `core/src/app/(dashboard)/bernard/user/profile/page.tsx`

#### Implementation Analysis

The user profile page allows authenticated users to view and update their profile information including display name. It integrates with the useAuth hook for current user data and profile updates.

**Key Components:**
- `Profile` default export with `ProfileContent`
- `useAuth` hook for user data and update operations
- `useDynamicHeader` for header configuration
- Form fields: display name, email (read-only)
- Save and reset buttons
- Success/error message display

**State Management:**
- `displayName` - controlled input
- `email` - read-only from auth state
- `isSaving` - loading state
- `successMessage` - feedback state

**Data Flow:**
1. Load user data from `useAuth().user`
2. Initialize form with user data
3. User modifies display name
4. Submit triggers `updateProfile(data)`
5. Show success/error message
6. Reset button restores original values

#### Test Scenarios

**Test 2.1.1: Initial Render**
```typescript
describe('Profile Page', () => {
  describe('Initial Render', () => {
    it('should display user email from auth state', () => {
      // Mock useAuth with user data
      // Render component
      // Verify email field shows user email
    });

    it('should display user display name', () => {
      // Mock useAuth with user
      // Render component
      // Verify displayName field shows user name
    });

    it('should show email as read-only', () => {
      // Render component
      // Verify email input is disabled/readonly
    });
  });
});
```

**Test 2.1.2: Profile Update**
```typescript
describe('Profile Updates', () => {
  it('should update displayName on input change', () => {
    // Render component
    // Change display name input
    // Verify local state updates
  });

  it('should call updateProfile on save', async () => {
    // Mock useAuth.updateProfile
    // Change display name
    // Click save button
    // Verify updateProfile called with correct data
  });

  it('should show loading state during save', async () => {
    // Mock updateProfile to delay
    // Click save
    // Verify isSaving state true
  });

  it('should show success message after save', async () => {
    // Mock updateProfile to succeed
    // Save profile
    // Verify success message displayed
  });

  it('should clear success message after timeout', async () => {
    // Mock updateProfile to succeed
    // Save profile
    // Wait for message timeout
    // Verify success message cleared
  });

  it('should show error message on save failure', async () => {
    // Mock updateProfile to reject
    // Save profile
    // Verify error message displayed
  });
});
```

**Test 2.1.3: Reset Functionality**
```typescript
describe('Reset Button', () => {
  it('should reset form to original values', async () => {
    // Render with user data
    // Change display name
    // Click reset button
    // Verify display name restored
  });

  it('should be disabled when no changes made', () => {
    // Render component
    // Verify reset button disabled
  });

  it('should be enabled after modifications', () => {
    // Render component
    // Change display name
    // Verify reset button enabled
  });
});
```

**Test 2.1.4: Avatar Display**
```typescript
describe('Avatar Component', () => {
  it('should show user initials in avatar', () => {
    // Mock useAuth with user
    // Render component
    // Verify avatar shows user initials
  });

  it('should handle missing user gracefully', () => {
    // Mock useAuth with null user
    // Render component
    // Verify loading or placeholder shown
  });
});
```

**Test 2.1.5: Dynamic Header**
```typescript
describe('Dynamic Header', () => {
  it('should set header title to User Settings', () => {
    // Render component
    // Verify useDynamicHeader called with title
  });

  it('should set header subtitle to Profile', () => {
    // Render component
    // Verify subtitle set correctly
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `useAuth` | User data & operations | Mock with user, updateProfile |
| `useDynamicHeader` | Header configuration | Mock implementation |

---

### 2.2 `/bernard/user/tokens/page.tsx` - API Token Management (0% coverage)

**File Location:** `core/src/app/(dashboard)/bernard/user/tokens/page.tsx`

#### Implementation Analysis

The tokens page provides CRUD operations for API tokens with special security considerations: tokens are only shown once during creation, displayed in a masked format, and include copy-to-clipboard functionality.

**Key Components:**
- `KeysPage` default export
- Token table with ID, name, created date, status, actions
- Create token dialog with secret reveal
- Status toggle (active/disabled)
- Delete confirmation
- Copy to clipboard functionality

**State Management:**
- `tokens` - array of token objects
- `loading` - fetch state
- `error` - error state
- `showCreateDialog` - create modal visibility
- `showSecretDialog` - secret reveal visibility
- `newTokenName` - form input
- `creating` - creation loading state
- `latestSecret` - one-time secret display
- `showActualToken` - reveal toggle

**Special Patterns:**
- Token secret shown only once
- Masked token display (e.g., `tok_abc...xyz`)
- LocalStorage not used (server-side only)
- Toast notifications for actions

#### Test Scenarios

**Test 2.2.1: Token List Render**
```typescript
describe('Token List', () => {
  describe('Initial Render', () => {
    it('should fetch tokens on mount', async () => {
      // Mock apiClient.listTokens
      // Render component
      // Verify listTokens called
    });

    it('should display tokens in table', async () => {
      // Mock tokens response
      // Render component
      // Verify table shows all tokens
    });

    it('should show empty state when no tokens', async () => {
      // Mock empty tokens array
      // Render component
      // Verify empty state displayed
    });

    it('should handle token fetch error', async () => {
      // Mock listTokens to reject
      // Render component
      // Verify error message shown
    });

    it('should show loading state', () => {
      // Mock loading state
      // Render component
      // Verify loading indicator
    });
  });
});
```

**Test 2.2.2: Token Creation**
```typescript
describe('Token Creation', () => {
  it('should open create dialog', () => {
    // Render component
    // Click create button
    // Verify showCreateDialog true
  });

  it('should create token with name', async () => {
    // Mock apiClient.createToken
    // Open create dialog
    name
    // // Enter token Submit
    // Verify createToken called
  });

  it('should show secret only once after creation', async () => {
    // Mock createToken response
    // Create token
    // Verify secret dialog shown
    // Close dialog
    // Reopen should NOT show secret
  });

  it('should handle creation error', async () => {
    // Mock createToken to reject
    // Create token
    // Verify error message shown
  });

  it('should clear form after creation', async () => {
    // Create token successfully
    // Create another token
    // Verify newTokenName reset
  });
});
```

**Test 2.2.3: Token Display & Masking**
```typescript
describe('Token Display', () => {
  it('should mask token in list', () => {
    // Mock tokens with full IDs
    // Render component
    // Verify tokens masked (e.g., tok_ab...yz)
  });

  it('should allow toggling token visibility', async () => {
    // Render component
    // Click reveal button
    // Verify full token shown
    // Click hide
    // Verify token masked again
  });

  it('should show created date formatted', () => {
    // Render component
    // Verify date formatted (e.g., "Jan 1, 2024")
  });
});
```

**Test 2.2.4: Token Actions**
```typescript
describe('Token Actions', () => {
  it('should toggle token status', async () => {
    // Mock apiClient.updateToken
    // Click status toggle
    // Verify updateToken called with new status
  });

  it('should delete token with confirmation', async () => {
    // Mock apiClient.deleteToken
    // Click delete button
    // Confirm deletion
    // Verify deleteToken called
  });

  it('should cancel delete without confirmation', async () => {
    // Click delete button
    // Cancel confirmation
    // Verify deleteToken NOT called
  });

  it('should copy token ID to clipboard', async () => {
    // Mock navigator.clipboard.writeText
    // Click copy button
    // Verify clipboard written
    // Verify toast shown
  });
});
```

**Test 2.2.5: Toast Notifications**
```typescript
describe('Toast Notifications', () => {
  it('should show success toast on create', async () => {
    // Create token
    // Verify success toast
  });

  it('should show success toast on delete', async () => {
    // Delete token
    // Verify success toast
  });

  it('should show error toast on failure', async () => {
    // Mock failure
    // Perform action
    // Verify error toast
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `apiClient.listTokens` | Fetch tokens | MockImplementation |
| `apiClient.createToken` | Create token | MockImplementation |
| `apiClient.updateToken` | Update token | MockImplementation |
| `apiClient.deleteToken` | Delete token | MockImplementation |
| `navigator.clipboard` | Copy to clipboard | Mock implementation |
| `sonner` | Toast notifications | Mock or spy |

---

## Phase 3: Layout Components Testing

### 3.1 `/bernard/user/layout.tsx` - User Section Guard (0% coverage)

**File Location:** `core/src/app/(dashboard)/bernard/user/layout.tsx`

#### Implementation Analysis

The user layout serves as an authentication guard for all user-specific routes. It checks authentication status and redirects guests (non-admin, non-logged-in users) to the chat page.

**Key Components:**
- `UserSectionLayout` default export
- `useEffect` for auth checking
- `useRouter` for redirection
- `useAuth` for auth state
- `UserLayout` wrapper for authenticated users

**Guard Logic:**
1. If `authState.loading` is true, return `null` (show nothing)
2. If `authState.user?.role === 'guest'`, redirect to `/bernard/chat`
3. If `authState.user` exists and is not guest, render `UserLayout` with children
4. If `authState.user` is null (unauthenticated), return `null` (hidden by loading check)

**Critical Detail**: The guard redirects **only guests** (role === 'guest'). Unauthenticated users (user === null) show nothing during loading state.

#### Test Scenarios

**Test 3.1.1: Guest Redirect**
```typescript
describe('UserSectionLayout', () => {
  describe('Guest User', () => {
    it('should redirect guest (role=guest) to /bernard/chat', async () => {
      // Mock useAuth with user.role === 'guest'
      // Render layout
      // Verify router.replace called with /bernard/chat
    });

    it('should not render children for guest', () => {
      // Mock useAuth with user.role === 'guest'
      // Render with test child
      // Verify child not rendered
    });

    it('should not render UserLayout for guest', () => {
      // Mock useAuth with user.role === 'guest'
      // Render layout
      // Verify UserLayout not rendered
    });
  });
});
```

**Test 3.1.2: Authenticated User**
```typescript
describe('Authenticated User', () => {
  it('should render UserLayout for authenticated user', () => {
    // Mock useAuth with user.role === 'user'
    // Render layout
    // Verify UserLayout rendered
  });

  it('should render UserLayout for admin user', () => {
    // Mock useAuth with user.role === 'admin'
    // Render layout
    // Verify UserLayout rendered
  });

  it('should render children inside UserLayout', () => {
    // Mock useAuth with user.role === 'user'
    // Render with test child
    // Verify child rendered inside UserLayout
  });

  it('should not redirect authenticated user', () => {
    // Mock useAuth with user.role === 'user'
    // Render layout
    // Verify router.replace NOT called
  });
});
```

**Test 3.1.3: Loading State**
```typescript
describe('Loading State', () => {
  it('should render nothing while loading', () => {
    // Mock useAuth with loading: true
    // Render layout
    // Verify no content rendered
  });

  it('should wait for auth state before decision', async () => {
    // Mock useAuth with loading initially true, then user
    // Render layout
    // Wait for loading to complete
    // Verify content rendered
  });

  it('should not redirect during loading', () => {
    // Mock useAuth with loading: true
    // Render layout
    // Verify router.replace NOT called during loading
  });
});
```

**Test 3.1.4: Unauthenticated User (user === null)**
```typescript
describe('Unauthenticated User', () => {
  it('should show nothing if user is null and not loading', () => {
    // Mock useAuth with user: null, loading: false
    // Render layout
    // Verify no content rendered
    // Verify no redirect attempted (only guests redirect)
  });

  it('should handle null user after loading completes', () => {
    // Mock useAuth with user: null, loading: false
    // Render layout
    // Verify no redirect, no content
  });
});
```

**Test 3.1.5: Router Interactions**
```typescript
describe('Router Behavior', () => {
  it('should use router.replace (not push) for redirect', () => {
    // Mock useAuth with user.role === 'guest'
    // Render layout
    // Verify replace called, not push
  });

  it('should redirect immediately on mount for guest', async () => {
    // Mock useAuth with user.role === 'guest'
    // Render layout
    // Verify router called in useEffect
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `useAuth` | Auth state | Mock with loading, user (with role), null states |
| `useRouter` | Navigation | Mock with replaceSpy |
| `UserLayout` | Layout wrapper | May need to mock or use real if it has dependencies |

---

### 3.2 `components/UserLayout.tsx` - User Layout Wrapper (0% coverage)

**File Location:** `core/src/components/UserLayout.tsx`

#### Implementation Analysis

The UserLayout component provides a consistent wrapper for user-facing pages with sidebar navigation specific to user functionality.

**Key Components:**
- `UserLayout` default export
- `children` prop for page content
- Wraps with `UserSidebarConfig` and `PageHeaderConfig` for dynamic navigation

**Dependencies:**
- `useDarkMode` hook - for theme handling
- `UserSidebarConfig` - sidebar configuration provider
- `PageHeaderConfig` - header configuration provider
- `children` - page content

**Note**: This component wraps children with multiple context providers. Tests may need to mock `useDarkMode` or provide actual providers.

#### Test Scenarios

**Test 3.2.1: Render Children**
```typescript
describe('UserLayout', () => {
  it('should render children content', () => {
    // Mock useDarkMode to return isDarkMode: false
    // Render with test child
    // Verify child rendered
  });

  it('should apply theme class based on dark mode', () => {
    // Mock useDarkMode to return isDarkMode: true
    // Render layout
    // Verify 'dark' class applied to wrapper
  });

  it('should render without dark mode', () => {
    // Mock useDarkMode to return isDarkMode: false
    // Render layout
    // Verify 'dark' class NOT applied
  });
});
```

**Test 3.2.2: Provider Wrapping**
```typescript
describe('Provider Wrapping', () => {
  it('should wrap children with UserSidebarConfig', () => {
    // Render layout
    // Verify UserSidebarConfig renders (may need to mock)
  });

  it('should wrap children with PageHeaderConfig', () => {
    // Render layout with title/subtitle
    // Verify PageHeaderConfig called with correct props
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `useDarkMode` | Theme state | Mock returning isDarkMode boolean |
| `UserSidebarConfig` | Sidebar provider | Mock or wrap with actual |
| `PageHeaderConfig` | Header provider | Mock or wrap with actual |

---

### 3.3 `components/AdminLayout.tsx` - Admin Layout (0% coverage)

**File Location:** `core/src/components/AdminLayout.tsx`

#### Implementation Analysis

The AdminLayout provides a wrapper for admin pages with admin-specific sidebar navigation and layout structure.

**Key Components:**
- `AdminLayout` default export (wraps with providers)
- `AdminLayoutContent` inner component (handles auth check)
- `PageHeaderConfig` for dynamic header
- `AdminSidebarConfig` for admin navigation

**Provider Stack (from inside out):**
1. `ToastManagerProvider` - toast notifications
2. `DialogManagerProvider` - dialog management
3. `DarkModeProvider` - theme context
4. `AuthProvider` - authentication
5. `AdminLayoutContent` - actual content with admin check

**Critical for Tests**: AdminLayout renders its own AuthProvider, so tests must either:
- Mock all nested providers, OR
- Use the real providers with mocked dependencies

#### Test Scenarios

**Test 3.3.1: Render Structure**
```typescript
describe('AdminLayout', () => {
  it('should render children when admin', () => {
    // Mock useAdminAuth to return isAdmin: true
    // Render layout
    // Verify children rendered
  });

  it('should show loading while checking admin', () => {
    // Mock useAdminAuth to return isAdminLoading: true
    // Render layout
    // Verify loading spinner shown
  });

  it('should show access denied for non-admin', () => {
    // Mock useAdminAuth to return isAdmin: false, isAdminLoading: false
    // Render layout
    // Verify access denied card shown
  });
});
```

**Test 3.3.2: Access Denied UI**
```typescript
describe('Access Denied', () => {
  it('should show access denied message', () => {
    // Mock useAdminAuth with non-admin user
    // Render layout
    // Verify "Access Denied" text shown
  });

  it('should have back to home button', () => {
    // Mock useAdminAuth with non-admin user
    // Render layout
    // Verify back button links to home
  });

  it('should have profile button', () => {
    // Mock useAdminAuth with non-admin user
    // Render layout
    // Verify profile button exists
  });
});
```

**Test 3.3.3: Service Status Integration**
```typescript
describe('Service Status', () => {
  it('should render ServiceStatusPanel', () => {
    // Render layout (admin user)
    // Verify ServiceStatusPanel present (may be in AdminSidebarConfig)
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `useAdminAuth` | Admin check | Mock with isAdmin, isAdminLoading states |
| `ToastManagerProvider` | Toast notifications | Mock or provide test wrapper |
| `DialogManagerProvider` | Dialog management | Mock or provide test wrapper |
| `DarkModeProvider` | Theme | Mock or provide test wrapper |
| `AuthProvider` | Authentication | Mock or provide MockAuthProvider |
| `AdminSidebarConfig` | Admin sidebar | Mock or wrap with actual |

---

## Phase 4: Auth Hooks Testing

### 4.1 `hooks/useAuth.ts` - Core Auth Hook (0% coverage, 190 lines)

**File Location:** `core/src/hooks/useAuth.ts`

#### Implementation Analysis

The useAuth hook is the central authentication provider for the entire application. It integrates with Better-Auth for session management and provides a comprehensive API for authentication operations.

**Key Exports:**
- `AuthProvider` component (React Context provider)
- `useAuth()` hook (context consumer)
- `mapBetterAuthUser()` helper function
- Types: `AuthContextType`, `AuthProviderProps`

**State:**
- `state: AuthState` - `{ user, loading, error }`
- `prevSessionRef` - memoization ref to prevent unnecessary re-renders
- `fallbackSession` - for server-side session fallback
- `fallbackError` - error from fallback fetch

**Methods:**
- `login(credentials)` - Email/password login via `authClient.signIn.email`
- `githubLogin()` - GitHub OAuth via `authClient.signIn.social({ provider: 'github' })`
- `googleLogin()` - Google OAuth via `authClient.signIn.social({ provider: 'google' })`
- `logout()` - Session termination via `authClient.signOut`
- `updateProfile(data)` - Profile updates via `authClient.updateUser`
- `clearError()` - **NO-OP** (Better-Auth handles errors differently)

**Critical Implementation Details:**
- Uses `authClient.useSession()` as primary session source
- Has fallback: fetches `/api/auth/get-session` after 1s delay if hook doesn't return session
- **`updateProfile` returns `mapBetterAuthUser(currentUser)!`** - does NOT return fresh data from server
- **`clearError()` is a no-op** - does nothing, kept for API compatibility
- State updates use `prevSessionRef` to compare session keys and prevent re-renders

#### Test Scenarios

**Test 4.1.1: Provider Initialization**
```typescript
describe('AuthProvider', () => {
  describe('Initialization', () => {
    it('should initialize with loading state', () => {
      // Render AuthProvider
      // Verify initial state.loading true
    });

    it('should fetch session on mount', async () => {
      // Mock authClient.useSession
      // Render provider
      // Verify useSession called
    });

    it('should update state with user data on success', async () => {
      // Mock authClient to return user
      // Render provider
      // Wait for resolution
      // Verify state.user contains user data with role
    });

    it('should set error on session fetch failure', async () => {
      // Mock authClient to reject
      // Render provider
      // Wait for rejection
      // Verify state.error set
    });
  });
});
```

**Test 4.1.2: Fallback Mechanism**
```typescript
describe('Fallback Session Fetch', () => {
  it('should trigger fallback after 1 second if no session', async () => {
    // Mock authClient.useSession to not resolve immediately
    // Render provider
    // Wait > 1 second
    // Verify fetch to /api/auth/get-session called
  });

  it('should not trigger fallback if session obtained', async () => {
    // Mock authClient.useSession to resolve quickly
    // Render provider
    // Wait for resolution
    // Verify fallback NOT called
  });

  it('should use fallback session data', async () => {
    // Mock authClient to reject
    // Mock fallback API to return user
    // Render provider
    // Wait for fallback
    // Verify state.user from fallback
  });
});
```

**Test 4.1.3: Email Login**
```typescript
describe('Email Login', () => {
  it('should call authClient.signIn.email', async () => {
    // Mock authClient.signIn.email
    // Render provider
    // Call login with credentials
    // Verify signIn.email called
  });

  it('should update state on successful login', async () => {
    // Mock signIn.email to return user
    // Render provider
    // Login with credentials
    // Wait for resolution
    // Verify state.user updated
  });

  it('should throw error on login failure (NOT set state.error)', async () => {
    // Mock signIn.email to reject
    // Render provider
    // Login with credentials
    // Wait for rejection
    // Verify Error thrown, NOT state.error
  });

  it('should NOT set error state - errors thrown as exceptions', async () => {
    // Login with invalid credentials
    // Verify Error thrown, NOT state.error
    // Note: Better-Auth returns errors as exceptions, not state
  });
});
```

**Test 4.1.4: OAuth Login**
```typescript
describe('OAuth Login', () => {
  it('should call githubLogin', async () => {
    // Mock authClient.signIn.social with provider='github'
    // Render provider
    // Call githubLogin()
    // Verify authClient called with correct provider
  });

  it('should call googleLogin', async () => {
    // Mock authClient.signIn.social with provider='google'
    // Render provider
    // Call googleLogin()
    // Verify authClient called with correct provider
  });
});
```

**Test 4.1.5: Logout**
```typescript
describe('Logout', () => {
  it('should call authClient.signOut', async () => {
    // Mock authClient.signOut
    // Render provider with user
    // Call logout()
    // Verify signOut called
  });

  it('should clear user state on logout', async () => {
    // Render provider with user
    // Call logout()
    // Verify state.user null after signOut completes
  });
});
```

**Test 4.1.6: Profile Updates**
```typescript
describe('Profile Updates', () => {
  it('should call authClient.updateUser API', async () => {
    // Mock authClient.updateUser
    // Render provider
    // Call updateProfile({ displayName: 'New Name' })
    // Verify called with data
  });

  it('should return CURRENT user, NOT fresh data from server', async () => {
    // Mock updateUser to return different data
    // Render provider with user
    // Call updateProfile
    // Verify returned user matches CURRENT user, NOT server response
    // ⚠️ This is intentional behavior - updateProfile returns cached user
  });
});
```

**Test 4.1.7: clearError is No-Op (REMOVED)**
```typescript
// clearError() is a NO-OP in real implementation
// Tests for clearing error state are NOT VALID
// Better-Auth handles errors as exceptions, not state
```

**Test 4.1.8: State Memoization**
```typescript
describe('State Memoization', () => {
  it('should not update if session unchanged', async () => {
    // Render provider with user
    // Verify prevSessionRef set
    // Trigger operations that don't change session
    // Verify state doesn't re-render
  });

  it('should update state when session changes', async () => {
    // Render provider with user
    // Mock session to change
    // Verify state updates
  });
});
```

**Test 4.1.9: User Role Mapping**
```typescript
describe('User Role Mapping', () => {
  it('should map Better-Auth role to User role', () => {
    // Mock authClient with admin user
    // Render provider
    // Verify state.user.role === 'admin'
  });

  it('should default role to user if not specified', () => {
    // Mock authClient with user without role
    // Render provider
    // Verify state.user.role === 'user'
  });
});
```

#### Mock Requirements

| Mock | Purpose | Setup |
|------|---------|-------|
| `authClient.useSession` | Session initialization | MockImplementation returning session |
| `authClient.signIn.email` | Email login | MockImplementation |
| `authClient.signIn.social` | OAuth login | MockImplementation (called for both github/google) |
| `authClient.signOut` | Logout | MockImplementation |
| `authClient.updateUser` | Profile update | MockImplementation |
| `fetch` (fallback) | Session fallback | MockImplementation for /api/auth/get-session |

---

### 4.2 `hooks/useAdminAuth.ts` - Admin Authorization (0% coverage)

**File Location:** `core/src/hooks/useAdminAuth.ts`

#### Implementation Analysis

A lightweight wrapper hook that derives admin-specific state from the main auth state. Used for permission checking across admin features.

**Key Exports:**
- `useAdminAuth()` hook

**State:**
- `isAdmin: boolean` - derived from `state.user?.role === 'admin'`
- `isAdminLoading: boolean` - derived from `state.loading` (true if loading AND no user AND no error)
- `user`, `error`, `loading` - passthrough from useAuth state

**Return Type:**
```typescript
{
  isAdmin: boolean;
  isAdminLoading: boolean;
  user: User | null;
  error: string | null;
  loading: boolean;
}
```

#### Test Scenarios

**Test 4.2.1: Admin Detection**
```typescript
describe('useAdminAuth', () => {
  describe('Admin Detection', () => {
    it('should return true for admin role', () => {
      // Mock useAuth with user having role: 'admin'
      // Call useAdminAuth()
      // Verify isAdmin true
    });

    it('should return false for user role', () => {
      // Mock useAuth with user having role: 'user'
      // Call useAdminAuth()
      // Verify isAdmin false
    });

    it('should return false for null user', () => {
      // Mock useAuth with null user
      // Call useAdminAuth()
      // Verify isAdmin false
    });

    it('should return false for guest role', () => {
      // Mock useAuth with user having role: 'guest'
      // Call useAdminAuth()
      // Verify isAdmin false
    });
  });
});
```

**Test 4.2.2: Loading State**
```typescript
describe('Loading State', () => {
  it('should return isAdminLoading true during auth loading', () => {
    // Mock useAuth with loading: true, user: null, error: null
    // Call useAdminAuth()
    // Verify isAdminLoading true
  });

  it('should return isAdminLoading false when not loading', () => {
    // Mock useAuth with loading: false
    // Call useAdminAuth()
    // Verify isAdminLoading false
  });

  it('should return isAdminLoading false when has error', () => {
    // Mock useAuth with loading: true, user: null, error: 'some error'
    // Call useAdminAuth()
    // Verify isAdminLoading false (has error, don't block)
  });

  it('should return isAdmin false during loading', () => {
    // Mock useAuth with loading: true
    // Call useAdminAuth()
    // Verify isAdmin false during loading
  });
});
```

**Test 4.2.3: State Passthrough**
```typescript
describe('State Passthrough', () => {
  it('should return user from useAuth', () => {
    // Mock useAuth with user
    // Call useAdminAuth()
    // Verify returned user matches
  });

  it('should return error from useAuth', () => {
    // Mock useAuth with error
    // Call useAdminAuth()
    // Verify returned error matches
  });

  it('should return loading from useAuth', () => {
    // Mock useAuth with loading
    // Call useAdminAuth()
    // Verify returned loading matches
  });
});
```

---

## Phase 5: Auth Library Testing

### 5.1 `lib/auth/auth-client.ts` - Auth Client (0% coverage)

**File Location:** `core/src/lib/auth/auth-client.ts`

#### Implementation Analysis

The auth-client module exports the Better-Auth client instance and related types for authentication operations throughout the application.

**Key Exports:**
- `authClient` - Better-Auth client instance
- `authCookie` - Cookie configuration
- Auth-related types and helpers

#### Test Scenarios

**Test 5.1.1: Client Configuration**
```typescript
describe('auth-client', () => {
  describe('Client Instance', () => {
    it('should export authClient', () => {
      // Import authClient
      // Verify it's defined
    });

    it('should have expected methods', () => {
      // Import authClient
      // Verify signIn, signUp, signOut, useSession exist
    });
  });
});
```

**Test 5.1.2: Type Exports**
```typescript
describe('Types', () => {
  it('should export required types', () => {
    // Import types
    // Verify User, Session, etc. exported
  });
});
```

---

### 5.2 `lib/auth/auth.ts` - Auth Module (34.54% coverage)

**File Location:** `core/src/lib/auth/auth.ts`

#### Implementation Analysis

The auth module contains the Better-Auth configuration and setup including plugins, adapters, and authentication strategies.

**Key Content:**
- Better-Auth configuration
- Plugin setup (if any)
- Adapter configuration

#### Test Scenarios

**Test 5.2.1: Configuration**
```typescript
describe('auth.ts', () => {
  it('should configure auth correctly', () => {
    // Import auth configuration
    // Verify expected plugins configured
  });

  it('should export required components', () => {
    // Verify all expected exports exist
  });
});
```

---

## Phase 5: Auth Library Testing

> **Note:** Shared test infrastructure (mocks, wrappers, helpers) is defined in [tasks-0.plan.md](tasks-0.plan.md). All tests in this plan use the centralized mock infrastructure.

### 5.1 `lib/auth/auth-client.ts` - Auth Client (0% coverage)

**File Location:** `core/src/lib/auth/auth-client.ts`

#### Implementation Analysis

The auth-client module exports the Better-Auth client instance and related types for authentication operations throughout the application.

**Key Exports:**
- `authClient` - Better-Auth client instance
- `authCookie` - Cookie configuration
- Auth-related types and helpers

#### Test Scenarios

**Test 5.1.1: Client Configuration**
```typescript
describe('auth-client', () => {
  describe('Client Instance', () => {
    it('should export authClient', () => {
      // Import authClient
      // Verify it's defined
    });

    it('should have expected methods', () => {
      // Import authClient
      // Verify signIn, signUp, signOut, useSession exist
    });
  });
});
```

**Test 5.1.2: Type Exports**
```typescript
describe('Types', () => {
  it('should export required types', () => {
    // Import types
    // Verify User, Session, etc. exported
  });
});
```

---

### 5.2 `lib/auth/auth.ts` - Auth Module (34.54% coverage)

**File Location:** `core/src/lib/auth/auth.ts`

#### Implementation Analysis

The auth module contains the Better-Auth configuration and setup including plugins, adapters, and authentication strategies.

**Key Content:**
- Better-Auth configuration
- Plugin setup (if any)
- Adapter configuration

#### Test Scenarios

**Test 5.2.1: Configuration**
```typescript
describe('auth.ts', () => {
  it('should configure auth correctly', () => {
    // Import auth configuration
    // Verify expected plugins configured
  });

  it('should export required components', () => {
    // Verify all expected exports exist
  });
});
```

---

## Success Criteria

### Coverage Targets (Revised)

| Component | Current | Target | Tests |
|-----------|---------|--------|-------|
| login/page.tsx | 0% | 80% | ~12 tests (reduced - no loading state tests) |
| logout/page.tsx | 0% | 85% | ~8 tests (+ error handling) |
| user/profile/page.tsx | 0% | 80% | ~18 tests |
| user/tokens/page.tsx | 0% | 85% | ~25 tests |
| user/layout.tsx | 0% | 90% | ~12 tests (+ null user, loading states) |
| UserLayout.tsx | 0% | 80% | ~5 tests |
| AdminLayout.tsx | 0% | 80% | ~8 tests |
| useAuth.ts | 0% | 85% | ~28 tests (+ memoization, role mapping; - clearError) |
| useAdminAuth.ts | 0% | 90% | ~12 tests (+ loading edge cases, passthrough) |
| auth-client.ts | 0% | 75% | ~5 tests |
| auth.ts | 34.54% | 75% | ~10 tests |

### Missing Items from Original Plan

| Original Plan Item | Status | Notes |
|--------------------|--------|-------|
| LoginPage loading states | ❌ Removed | No loading state in implementation |
| LoginPage OAuth buttons | ❌ Removed | No OAuth buttons in implementation |
| LoginPage confirm password | ❌ Removed | No confirm password in implementation |
| LoginPage form validation utilities | ❌ Removed | No validation logic to extract |
| useAuth clearError tests | ❌ Removed | clearError is no-op |
| useAuth getCurrentUser | ❌ Removed | Method doesn't exist in implementation |

### New Items Added

| New Item | Reason |
|----------|--------|
| LoginPage name-from-email test | Implementation extracts name from email prefix |
| Logout error handling tests | Implementation lacks error handling |
| useAuth updateProfile returns cached user | Important test to verify behavior |
| useAuth state memoization tests | Implementation uses prevSessionRef optimization |
| useAuth role mapping tests | Maps Better-Auth role to User role |
| useAdminAuth loading edge cases | Complex loading logic with null/error states |
| UserLayout theme class tests | Tests dark mode class application |
| AdminLayout provider stack tests | Complex nested provider structure |
| AdminLayout access denied UI tests | UI for non-admin users |

### Quality Gates

All tests must:
1. Pass in isolation (no test pollution)
2. Clean up after themselves (mocks, timers)
3. Cover error paths, not just happy paths
4. Use proper async/await patterns
5. Include TypeScript type coverage
6. **Match actual implementation behavior** (verify against real code, not assumptions)

---

## Next Steps

After completing this plan:
1. Run tests to verify coverage improvements
2. Review any remaining 0% coverage files
3. Move to tasks-B.plan.md for API routes testing
4. Continue with components, hooks, and library files

**End of Tasks A**
