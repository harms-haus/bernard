# Unified Dynamic Sidebar Implementation Plan

**Author:** Sisyphus AI Agent  
**Date:** January 17, 2026  
**Status:** Planning Complete - Ready for Implementation

---

## 1. Executive Summary

This document outlines the implementation of a unified, dynamic sidebar system for the Bernard application. The sidebar will be a single, consistent component used across ALL `/bernard/*` routes, with content driven entirely by the pages that are loaded into the content area. This approach eliminates the current fragmented sidebar implementations and creates a cohesive, content-driven navigation experience.

### Key Principles

- **Single Sidebar, Multiple Personalities**: One sidebar component with configurable content
- **Content-Driven**: Pages control their sidebar content via a dedicated context/service
- **Component Composition**: Menu items accept ReactNode children for maximum flexibility
- **Consistent Footer**: Always ends with user account badge
- **Clean Integration**: Appears native to the application, not tacked-on

### Scope

This plan covers:
- Creation of a new dynamic sidebar infrastructure
- Replacement of all existing sidebar implementations
- Integration with `/bernard/admin/*`, `/bernard/user/*`, and `/bernard/chat` routes
- Removal of deprecated sidebar components

---

## 2. Current State Analysis

### Existing Sidebar Implementations

The application currently has THREE separate sidebar implementations, each with its own structure and behavior:

#### 2.1 Chat Sidebar (`ConversationHistory`)

**Location:** `core/src/components/chat/ConversationHistory.tsx`

**Structure:**
- Fixed width: 300px (collapsible to 0px)
- Three sections:
  1. **Header**: "Chats" title + "+" button for new thread
  2. **Body**: Scrollable thread list with individual thread items
     - Each thread item includes:
       - Thread name (auto-truncated)
       - Hover menu with: Rename, Auto-Rename, Delete actions
       - Inline renaming capability
  3. **Footer**: Conditional admin link + UserBadge

**Mobile Behavior:**
- Slide-over panel (280px width)
- Overlay with backdrop blur
- Toggle button in top-left corner when sidebar closed

**Dependencies:**
- `useSidebarState()` for open/close state
- `useThreads()` for thread data
- `ThreadProvider` for thread management
- `UserBadge` component

#### 2.2 Admin Sidebar (`AdminLayout`)

**Location:** `core/src/components/AdminLayout.tsx`

**Structure:**
- Fixed width: 256px
- Three sections:
  1. **Header**: "Admin Panel" title + Dark mode toggle + mobile close button
  2. **Body**: Navigation menu with icons
     - Status → `/bernard/admin`
     - Models → `/bernard/admin/models`
     - Services → `/bernard/admin/services`
     - Users → `/bernard/admin/users`
  3. **Footer**: "Chat" button + UserBadge

**Styling:**
- Uses `bg-card` with `border-r border-border`
- Active state styling with `bg-accent`
- Hover transitions on all menu items

**Dependencies:**
- `useAdminAuth()` for admin checks
- `useDarkMode()` for theme toggle
- `UserBadge` component
- Hardcoded navigation array

#### 2.3 User Sidebar (`UserLayout`)

**Location:** `core/src/components/UserLayout.tsx`

**Structure:**
- Fixed width: 256px
- Four sections:
  1. **Header**: "Bernard UI" title + Dark mode toggle + mobile close button
  2. **Body**: Navigation menu with icons (hidden on chat routes)
     - Chat → `/bernard/chat`
     - Tasks → `/bernard/tasks`
     - Keys → `/bernard/keys`
     - About → `/bernard/about`
  3. **Conditional Section**: Admin link (if user.isAdmin)
  4. **Footer**: UserBadge

**Mobile Behavior:**
- Slide-over panel (same structure as desktop)
- Toggle button in top header bar (hidden on chat routes)

**Dependencies:**
- `useAuth()` for user state
- `useDarkMode()` for theme toggle
- `UserBadge` component
- Hardcoded navigation array

### Current Layout Hierarchy

```
Root Layout (app/(dashboard)/layout.tsx)
└── BernardLayout (app/(dashboard)/bernard/layout.tsx)
    ├── Providers: Auth, DarkMode, Toast, Dialog, Thread, Sidebar, Header
    └── BernardLayoutContent
        ├── ConversationHistory (sidebar for chat only)
        ├── BernardHeader
        └── {children} (page content)

Admin Routes (app/(dashboard)/bernard/admin/*)
└── AdminLayout (wraps children)
    ├── Admin sidebar (duplicate implementation)
    └── {children} (page content)

User Routes (app/(dashboard)/bernard/user/*)
└── UserLayout (wraps children)
    ├── User sidebar (duplicate implementation, hidden on chat routes)
    └── {children} (page content)
```

### Issues with Current Architecture

1. **Code Duplication**: Three sidebar implementations with similar but slightly different structures
2. **Inconsistent Styling**: Different widths, colors, and interaction patterns
3. **State Fragmentation**: Multiple sidebar state management approaches
4. **Maintenance Burden**: Changes require updates in multiple places
5. **No Unified Experience**: User perceives three different sidebars rather than one adaptive sidebar
6. **Route-Specific Logic**: Sidebar visibility logic embedded in layout components

---

## 3. New Architecture Design

### 3.1 Core Concept

The new architecture introduces a single `DynamicSidebar` component that serves all `/bernard/*` routes. The sidebar's content is controlled by a dedicated context that pages can modify. This creates a "content-driven" sidebar where the page determines what navigation options are available.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dynamic Sidebar                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HEADER (configurable: string or ReactNode)             │   │
│  │  - Admin: "Admin Panel"                                 │   │
│  │  - User: "Bernard UI"                                   │   │
│  │  - Chat: "Chat" + "+" button for new thread             │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MENU ITEMS (array of DynamicSidebarMenuItem)           │   │
│  │  - Each item wraps a child component                    │   │
│  │  - Handles hover/click events                           │   │
│  │  - Shows active state based on current route            │   │
│  │  - Admin: Status, Models, Services, Users               │   │
│  │  - User: Profile, Tokens                                │   │
│  │  - Chat: Thread list with custom components             │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  FOOTER                                                  │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │ Optional footer items (above UserBadge)           │  │   │
│  │  │ - Admin/User: "Chat" link                         │  │   │
│  │  │ - Chat: (empty, or custom if needed)              │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │ UserBadge (always present at bottom)              │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Context-Based Configuration

A React Context (`DynamicSidebarContext`) provides the bridge between pages and the sidebar. Pages modify the context on mount, and the sidebar reflects these changes immediately.

```typescript
// Context value interface
interface DynamicSidebarContextValue {
  // Header configuration
  header: DynamicSidebarHeader | null;
  setHeader: (header: DynamicSidebarHeader | null) => void;
  
  // Menu items configuration
  menuItems: DynamicSidebarMenuItemConfig[];
  setMenuItems: (items: DynamicSidebarMenuItemConfig[]) => void;
  
  // Footer configuration
  footerItems: ReactNode[];
  setFooterItems: (items: ReactNode[]) => void;
  
  // Reset to defaults
  reset: () => void;
}
```

### 3.3 Component Composition

The sidebar is built from composable parts:

| Component | Purpose |
|-----------|---------|
| `DynamicSidebarProvider` | Context provider wrapping the application |
| `DynamicSidebar` | Main sidebar container, consumes context |
| `DynamicSidebarHeader` | Renders header (string or custom component) |
| `DynamicSidebarMenuItem` | Wrapper component for menu items with event handling |
| `DynamicSidebarContent` | Container for menu items |
| `DynamicSidebarFooter` | Footer container with UserBadge |

### 3.4 Menu Item Architecture

The menu item system is designed for maximum flexibility:

```typescript
interface DynamicSidebarMenuItemConfig {
  id: string;
  children: ReactNode;        // The actual content (string, icon + text, custom component)
  href?: string;              // For active route detection
  onClick?: () => void;       // Click handler
  isActive?: boolean;         // Override active state
}
```

The `DynamicSidebarMenuItem` wrapper provides:
- Hover state styling
- Active route detection (based on href)
- Click event handling
- Keyboard navigation
- Accessibility attributes

---

## 4. Page-Specific Configurations

### 4.1 Admin Section (`/bernard/admin/*`)

**Header:**
- String: "Admin Panel"

**Menu Items:**
| Label | Icon | Route |
|-------|------|-------|
| Status | LayoutDashboard | `/bernard/admin` |
| Models | Settings | `/bernard/admin/models` |
| Services | Server | `/bernard/admin/services` |
| Users | Users | `/bernard/admin/users` |

**Footer Items:**
- "Chat" link → `/bernard/chat`

**UserBadge:** Always present at bottom

### 4.2 User Section (`/bernard/user/*`)

**Header:**
- String: "Bernard UI"

**Menu Items:**
| Label | Icon | Route |
|-------|------|-------|
| Profile | User | `/bernard/user/profile` |
| Tokens | Key | `/bernard/user/tokens` |

**Footer Items:**
- "Admin" link (conditional, if user.isAdmin) → `/bernard/admin`

**UserBadge:** Always present at bottom

### 4.3 Chat Section (`/bernard/chat`)

**Header:**
- Custom component:
  - Left: "Chats" title
  - Right: "+" button (new thread)

**Menu Items:**
- Thread list with custom components:
  - Each thread displayed as a button
  - Thread name with truncation
  - Right-side "..." dropdown menu:
    - Rename
    - Auto-Rename
    - Delete
  - Inline renaming capability

**Footer Items:**
- "Admin" link (conditional, if user.isAdmin) → `/bernard/admin`

**UserBadge:** Always present at bottom

---

## 5. Implementation Phases

### Phase 1: Core Infrastructure

**Goal:** Create the foundational components and context

#### Deliverables:

1. **DynamicSidebarContext.tsx**
   - Context definition
   - Provider component
   - Type definitions
   - Helper types

2. **DynamicSidebar.tsx**
   - Main sidebar container
   - State management (open/close)
   - Mobile responsiveness
   - Animation transitions

3. **DynamicSidebarHeader.tsx**
   - Header rendering
   - String support
   - ReactNode support
   - Default styling

4. **DynamicSidebarMenuItem.tsx**
   - Wrapper component
   - Hover/click handling
   - Active state detection
   - Keyboard navigation

5. **DynamicSidebarContent.tsx**
   - Menu items container
   - Scroll handling
   - Spacing/alignment

6. **DynamicSidebarFooter.tsx**
   - Footer container
   - UserBadge integration
   - Footer items rendering

7. **index.ts**
   - Barrel exports for the module

### Phase 2: Sidebar Configurations

**Goal:** Create preset configurations for each section

#### Deliverables:

1. **AdminSidebarConfig.tsx**
   - Admin menu items array
   - Header configuration
   - Footer items configuration
   - Configuration hook

2. **UserSidebarConfig.tsx**
   - User menu items array
   - Header configuration
   - Footer items configuration
   - Configuration hook

3. **ChatSidebarConfig.tsx**
   - Chat menu items (thread list)
   - Custom thread item component
   - Header configuration (with + button)
   - Footer items configuration
   - Thread management integration

### Phase 3: Integration

**Goal:** Replace existing sidebars with the new dynamic system

#### Deliverables:

1. **Update BernardLayoutContent**
   - Remove ConversationHistory import
   - Import DynamicSidebar
   - Wrap children with DynamicSidebarProvider
   - Remove duplicate sidebar code

2. **Create Layout Wrappers**
   - `AdminSidebarWrapper`: Sets admin config on mount
   - `UserSidebarWrapper`: Sets user config on mount
   - `ChatSidebarWrapper`: Sets chat config on mount

3. **Update Route Layouts**
   - `/bernard/admin/*` → Use AdminSidebarWrapper
   - `/bernard/user/*` → Use UserSidebarWrapper
   - `/bernard/chat` → Use ChatSidebarWrapper

4. **Update Page Components**
   - Remove manual header title setting (if any)
   - Remove inline sidebar configurations (if any)

### Phase 4: Cleanup

**Goal:** Remove deprecated components

#### Deliverables:

1. **Delete Deprecated Files**
   - `core/src/components/chat/ConversationHistory.tsx`
   - `core/src/components/AdminLayout.tsx`
   - `core/src/components/UserLayout.tsx`

2. **Update Imports**
   - Remove references to deleted components
   - Update import statements across codebase

3. **Remove Unused Code**
   - Remove unused sidebar state from providers
   - Remove duplicate header logic
   - Clean up unused imports

---

## 6. Detailed File Structure

```
core/src/
├── components/
│   ├── dynamic-sidebar/
│   │   ├── index.ts                              # Barrel exports
│   │   ├── types.ts                              # TypeScript interfaces
│   │   ├── DynamicSidebarContext.tsx             # React Context
│   │   ├── DynamicSidebarProvider.tsx            # Context Provider
│   │   ├── useDynamicSidebar.tsx                 # Context hook
│   │   ├── DynamicSidebar.tsx                    # Main component
│   │   ├── DynamicSidebarHeader.tsx              # Header component
│   │   ├── DynamicSidebarMenuItem.tsx            # Menu item wrapper
│   │   ├── DynamicSidebarContent.tsx             # Menu items container
│   │   ├── DynamicSidebarFooter.tsx              # Footer component
│   │   └── configs/
│   │       ├── index.ts                          # Config barrel exports
│   │       ├── AdminSidebarConfig.tsx            # Admin configuration
│   │       ├── UserSidebarConfig.tsx             # User configuration
│   │       └── ChatSidebarConfig.tsx             # Chat configuration
│   │
│   └── chat/
│       ├── BernardLayoutContent.tsx              # Updated to use DynamicSidebar
│       ├── BernardHeader.tsx                     # May be updated/refactored
│       ├── HeaderService.tsx                     # May be updated
│       └── SidebarProvider.tsx                   # May be removed/consolidated
│
├── app/
│   └── (dashboard)/
│       ├── bernard/
│       │   ├── layout.tsx                        # Updated providers
│       │   ├── admin/
│       │   │   ├── layout.tsx                    # Admin layout wrapper
│       │   │   ├── page.tsx                      # Updated (removed AdminLayout)
│       │   │   ├── models/
│       │   │   │   └── page.tsx
│       │   │   ├── services/
│       │   │   │   └── page.tsx
│       │   │   └── users/
│       │   │       └── page.tsx
│       │   │
│       │   ├── user/
│       │   │   ├── layout.tsx                    # User layout wrapper
│       │   │   ├── profile/
│       │   │   │   └── page.tsx                  # Updated (removed UserLayout)
│       │   │   └── tokens/
│       │   │       └── page.tsx
│       │   │
│       │   ├── chat/
│       │   │   ├── layout.tsx                    # Chat layout wrapper
│       │   │   └── page.tsx                      # Updated (removed ConversationHistory)
│       │   │
│       │   ├── page.tsx                          # Default bernard page
│       │   ├── tasks/
│       │   │   ├── page.tsx
│       │   │   └── [id]/
│       │   │       └── page.tsx
│       │   └── about/
│       │       └── page.tsx
│       │
│       └── layout.tsx                            # Root dashboard layout
│
├── hooks/
│   └── useDynamicSidebar.ts                      # May be consolidated into component
│
└── providers/                                     # May need updates
    └── ThreadProvider.ts                         # For chat thread management
```

---

## 7. Component Specifications

### 7.1 DynamicSidebarContext

```typescript
// core/src/components/dynamic-sidebar/types.ts

import { ReactNode } from 'react';

export interface DynamicSidebarMenuItemConfig {
  id: string;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
}

export interface DynamicSidebarHeaderConfig {
  type: 'text' | 'component';
  content: string | ReactNode;
}

export interface DynamicSidebarContextValue {
  // Header
  header: DynamicSidebarHeaderConfig | null;
  setHeader: (header: DynamicSidebarHeaderConfig | null) => void;
  
  // Menu Items
  menuItems: DynamicSidebarMenuItemConfig[];
  setMenuItems: (items: DynamicSidebarMenuItemConfig[]) => void;
  addMenuItem: (item: DynamicSidebarMenuItemConfig, index?: number) => void;
  removeMenuItem: (id: string) => void;
  updateMenuItem: (id: string, updates: Partial<DynamicSidebarMenuItemConfig>) => void;
  
  // Footer Items
  footerItems: ReactNode[];
  setFooterItems: (items: ReactNode[]) => void;
  addFooterItem: (item: ReactNode, index?: number) => void;
  clearFooterItems: () => void;
  
  // Reset
  reset: () => void;
}
```

### 7.2 DynamicSidebar

**Props:** None (consumes context)

**Behavior:**
- Reads configuration from context
- Renders header, content, and footer
- Manages open/close state (persisted to localStorage)
- Responsive: mobile slide-over, desktop fixed
- Animate width transitions

**Styling:**
- Width: 300px (desktop), 280px (mobile)
- Border-right: 1px solid var(--border)
- Background: var(--background)
- Height: 100vh
- Position: fixed (mobile), relative (desktop, flex item)

### 7.3 DynamicSidebarMenuItem

**Props:**
```typescript
interface DynamicSidebarMenuItemProps {
  id: string;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  className?: string;
}
```

**Behavior:**
- Wraps children in interactive element
- Detects active route from href (if not explicitly set)
- Shows hover state styling
- Handles click events
- Applies disabled state if isDisabled

**Accessibility:**
- role="button" or appropriate ARIA role
- tabIndex={0}
- Keyboard navigation (Enter, Space)
- aria-disabled for disabled state

### 7.4 Chat Thread Menu Item (Special Case)

The chat thread menu items are special because they need:
- Custom component rendering (thread name)
- Dropdown menu for actions (rename, delete, etc.)
- Inline renaming capability
- Auto-rename functionality

This will be implemented as a specialized menu item component within the ChatSidebarConfig.

---

## 8. Integration Strategy

### 8.1 Provider Setup

The `DynamicSidebarProvider` will be added to the existing provider chain in `bernard/layout.tsx`:

```tsx
// Before
<SidebarProvider>
  <HeaderProvider>
    <BernardLayoutContent>{children}</BernardLayoutContent>
  </HeaderProvider>
</SidebarProvider>

// After
<DynamicSidebarProvider>
  <BernardLayoutContent>{children}</BernardLayoutContent>
</DynamicSidebarProvider>
```

### 8.2 Layout Wrapper Pattern

Each section will have a layout wrapper that configures the sidebar:

```tsx
// admin/layout.tsx
export default function AdminLayout({ children }) {
  useAdminSidebarConfig(); // Sets up admin sidebar on mount
  
  return <>{children}</>;
}

// hooks/useAdminSidebarConfig.ts
export function useAdminSidebarConfig() {
  const { setHeader, setMenuItems, setFooterItems } = useDynamicSidebar();
  
  useEffect(() => {
    setHeader({ type: 'text', content: 'Admin Panel' });
    setMenuItems(adminMenuItems);
    setFooterItems([<ChatLink key="chat" />]);
    
    return () => reset();
  }, []);
}
```

### 8.3 BernardLayoutContent Update

```tsx
// Before
export function BernardLayoutContent({ children }) {
  const [isOpen] = useSidebarState();
  
  return (
    <div className="flex w-full h-screen overflow-hidden bg-background">
      <div className={cn("hidden lg:flex ...", isOpen ? "w-[300px]" : "w-0")}>
        <ConversationHistory />
      </div>
      <div className="flex-1 ...">
        <BernardHeader />
        <main>{children}</main>
      </div>
    </div>
  );
}

// After
export function BernardLayoutContent({ children }) {
  return (
    <div className="flex w-full h-screen overflow-hidden bg-background">
      <DynamicSidebar />
      <div className="flex-1 ...">
        <BernardHeader />
        <main>{children}</main>
      </div>
    </div>
  );
}
```

---

## 9. Visual Consistency

### 9.1 Styling Principles

The dynamic sidebar will follow these styling principles:

1. **Consistent Width**: 300px on desktop, 280px on mobile
2. **Consistent Colors**: Use CSS variables (--background, --border, --foreground, etc.)
3. **Consistent Typography**: Use existing Tailwind typography classes
4. **Consistent Spacing**: Follow existing spacing patterns (p-4, px-2, etc.)
5. **Consistent Animations**: Use framer-motion for smooth transitions

### 9.2 Component Styling

| Component | Classes |
|-----------|---------|
| Sidebar container | `flex flex-col h-screen shrink-0 border-r bg-background` |
| Header | `flex items-center justify-between w-full p-4 h-14 border-b shrink-0` |
| Menu item wrapper | `w-full px-1 group relative` |
| Menu item button | `flex items-center justify-start font-normal w-full hover:bg-muted` |
| Footer | `p-4 border-t space-y-4 shrink-0 bg-background/50 backdrop-blur-sm` |

---

## 10. Testing Strategy

### 10.1 Unit Tests

Test each component in isolation:
- `DynamicSidebarContext.test.tsx`
- `DynamicSidebar.test.tsx`
- `DynamicSidebarMenuItem.test.tsx`
- Configuration hooks tests

### 10.2 Integration Tests

Test sidebar behavior in different contexts:
- Admin section sidebar configuration
- User section sidebar configuration
- Chat section sidebar configuration
- Mobile responsive behavior
- State persistence

### 10.3 E2E Tests

Test complete user flows:
- Navigation through admin section
- Navigation through user section
- Chat thread creation and selection
- Mobile navigation

---

## 11. Migration Checklist

### Pre-Migration
- [ ] Create backup of current state
- [ ] Document current sidebar behavior
- [ ] Set up testing environment

### Phase 1: Core Infrastructure
- [ ] Create DynamicSidebarContext
- [ ] Create DynamicSidebar components
- [ ] Create types and exports
- [ ] Run unit tests

### Phase 2: Configurations
- [ ] Create AdminSidebarConfig
- [ ] Create UserSidebarConfig
- [ ] Create ChatSidebarConfig
- [ ] Test configuration hooks

### Phase 3: Integration
- [ ] Update BernardLayoutContent
- [ ] Create layout wrappers
- [ ] Update route layouts
- [ ] Test all routes

### Phase 4: Cleanup
- [ ] Delete deprecated files
- [ ] Update imports
- [ ] Run full test suite
- [ ] Verify no regressions

### Post-Migration
- [ ] Verify visual consistency
- [ ] Test mobile behavior
- [ ] Document changes
- [ ] Update AGENTS.md

---

## 12. Dependencies and Constraints

### Dependencies

1. **React 18+**: Uses use() hook and concurrent features
2. **Tailwind CSS**: All styling uses Tailwind classes
3. **Framer Motion**: For sidebar animations
4. **Lucide React**: For icons
5. **Existing Providers**: Auth, DarkMode, Toast, etc.

### Constraints

1. **No Breaking Changes**: Application must function identically after migration
2. **Type Safety**: No `any` types, full TypeScript coverage
3. **Accessibility**: WCAG 2.1 AA compliance
4. **Performance**: No unnecessary re-renders
5. **Mobile First**: Must work well on mobile devices

---

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sidebar state loss on navigation | Medium | Use context + localStorage persistence |
| Mobile responsiveness issues | High | Test on multiple screen sizes |
| Route matching errors | Medium | Use Next.js usePathname hook |
| Performance degradation | Low | Memoize components, use context selectors |
| Accessibility issues | High | Follow ARIA patterns, test with screen readers |

---

## 14. Success Criteria

1. **Single Sidebar**: All `/bernard/*` routes use one DynamicSidebar component
2. **Content-Driven**: Pages control sidebar content via context
3. **Visual Consistency**: Sidebar looks native to each section
4. **Mobile Responsive**: Works seamlessly on mobile devices
5. **No Regressions**: All existing functionality preserved
6. **Clean Code**: Well-organized, documented, testable

---

## 15. Timeline Estimate

| Phase | Effort | Duration |
|-------|--------|----------|
| Phase 1: Core Infrastructure | 2 days | 2 days |
| Phase 2: Configurations | 1 day | 1 day |
| Phase 3: Integration | 2 days | 2 days |
| Phase 4: Cleanup | 0.5 day | 0.5 day |
| **Total** | **5.5 days** | **~1 week** |

---

## 16. References

- Current sidebar implementations:
  - `core/src/components/chat/ConversationHistory.tsx`
  - `core/src/components/AdminLayout.tsx`
  - `core/src/components/UserLayout.tsx`
- Existing context providers:
  - `core/src/components/chat/SidebarProvider.tsx`
  - `core/src/components/chat/HeaderService.tsx`
- Layout files:
  - `core/src/app/(dashboard)/bernard/layout.tsx`
  - `core/src/components/chat/BernardLayoutContent.tsx`

---

**Document Version:** 1.0  
**Last Updated:** January 17, 2026  
**Next Review:** Before implementation start
