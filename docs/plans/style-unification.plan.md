# Bernard UI Style Unification Plan

**Created:** January 16, 2026  
**Updated:** January 16, 2026  
**Objective:** Bring consistent CSS styles from `/status` screen into all `/bernard/*` UI screens, with full light/dark mode support

---

## Analysis Summary

### Current Design System from `/status` Screen

| Element | Dark Mode Value | Light Mode Value |
|---------|-----------------|------------------|
| **Background** | `#020617` (slate-950) | `#f8fafc` (slate-50) |
| **Surface/Cards** | `#1e293b` (slate-800) | `#ffffff` (white) |
| **Text** | `#f8fafc` (slate-50) | `#0f172a` (slate-900) |
| **Muted Text** | `#94a3b8` (slate-400) | `#64748b` (slate-500) |
| **Status Online** | `#22c55e` (green-500) | `#16a34a` (green-600) |
| **Status Degraded** | `#eab308` (yellow-500) | `#ca8a04` (yellow-600) |
| **Status Offline** | `#ef4444` (red-500) | `#dc2626` (red-600) |
| **Border** | `rgba(148, 163, 184, 0.2)` | `rgba(148, 163, 184, 0.2)` |

### Bernard Pages Current State

| Page | Issues |
|------|--------|
| `/bernard/page.tsx` | Basic welcome card with inconsistent gray backgrounds that break dark mode |
| `/bernard/about/page.tsx` | Grid cards using `bg-gray-100` which doesn't adapt to dark mode |
| `/bernard/profile/page.tsx` | Form with mixed styling patterns |
| `/bernard/tasks/page.tsx` | Table with good structure but inconsistent colors |
| `/bernard/chat/page.tsx` | Chat interface needs dark mode integration |

---

## Plan: Unified Design System Implementation

### Phase 1: Define Design Tokens and Custom Tailwind Classes

#### 1.1 Update Tailwind Config

**File:** `core/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Status colors (consistent across modes)
        status: {
          online: {
            DEFAULT: '#22c55e',
            light: '#16a34a',
          },
          degraded: {
            DEFAULT: '#eab308',
            light: '#ca8a04',
          },
          offline: {
            DEFAULT: '#ef4444',
            light: '#dc2626',
          },
        },
        // Surface colors - adapts to dark/light mode
        surface: {
          DEFAULT: '#1e293b',   // slate-800 (dark mode default)
          light: '#ffffff',     // white (light mode default)
          hover: {
            DEFAULT: '#334155', // slate-700 (dark mode)
            light: '#f1f5f9',   // slate-100 (light mode)
          },
        },
        // Background colors
        background: {
          DEFAULT: '#020617',   // slate-950 (dark mode)
          light: '#f8fafc',     // slate-50 (light mode)
        },
      },
      // Custom spacing and border radius for consistency
      borderRadius: {
        card: '0.75rem',        // rounded-xl equivalent
      },
      // Custom box shadows
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
    },
  },
  plugins: [],
}
```

#### 1.2 Create Shared CSS Design Tokens

**File:** `core/src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Default to dark mode variables */
    --background: #020617;
    --surface: #1e293b;
    --surface-hover: #334155;
    
    --foreground: #f8fafc;
    --muted: #94a3b8;
    --muted-foreground: #cbd5e1;
    
    --status-online: #22c55e;
    --status-degraded: #eab308;
    --status-offline: #ef4444;
    
    --border: rgba(148, 163, 184, 0.2);
    
    --font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }
  
  /* Light mode overrides */
  .light {
    --background: #f8fafc;
    --surface: #ffffff;
    --surface-hover: #f1f5f9;
    
    --foreground: #0f172a;
    --muted: #64748b;
    --muted-foreground: #475569;
    
    /* Status colors slightly darker for light mode contrast */
    --status-online: #16a34a;
    --status-degraded: #ca8a04;
    --status-offline: #dc2626;
    
    --border: rgba(148, 163, 184, 0.2);
  }
  
  html {
    color-scheme: dark;
  }
  
  html.light {
    color-scheme: light;
  }
  
  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-family);
    transition: background-color 0.3s ease, color 0.3s ease;
  }
}

@layer components {
  /* Unified card style - adapts to both modes */
  .bernard-card {
    @apply bg-surface text-foreground border border-border rounded-card shadow-card overflow-hidden transition-colors;
  }
  
  /* Hover state for cards */
  .bernard-card-hover {
    @apply bernard-card hover:bg-surface-hover transition-colors cursor-pointer;
  }
  
  /* Surface container for nested content */
  .bernard-surface {
    @apply bg-surface-hover rounded-lg p-4 transition-colors;
  }
  
  /* Unified button style variants */
  .bernard-btn-primary {
    @apply bg-primary text-primary-foreground hover:bg-primary/90;
  }
  
  .bernard-btn-secondary {
    @apply bg-surface border border-border hover:bg-surface-hover transition-colors;
  }
  
  .bernard-btn-ghost {
    @apply hover:bg-surface-hover transition-colors;
  }
  
  /* Status indicator dots */
  .status-indicator {
    @apply w-2 h-2 rounded-full;
  }
  
  .status-online {
    @apply bg-status-online;
  }
  
  .status-degraded {
    @apply bg-status-degraded;
  }
  
  .status-offline {
    @apply bg-status-offline;
  }
  
  /* Page header */
  .page-header {
    @apply mb-6;
  }
  
  .page-title {
    @apply text-3xl font-bold text-foreground transition-colors;
  }
  
  .page-description {
    @apply text-muted-foreground transition-colors;
  }
  
  /* Card section header */
  .section-header {
    @apply flex items-center justify-between mb-4;
  }
  
  .section-title {
    @apply text-xl font-semibold text-foreground transition-colors;
  }
  
  /* Link styles */
  .bernard-link {
    @apply text-primary hover:text-primary/80 underline-offset-4 hover:underline transition-colors;
  }
  
  /* Input styles */
  .bernard-input {
    @apply bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors;
  }
  
  /* Divider */
  .bernard-divider {
    @apply border-border;
  }
  
  /* Table styles */
  .bernard-table-header {
    @apply text-left py-3 px-4 font-semibold text-muted-foreground text-sm uppercase tracking-wider;
  }
  
  .bernard-table-cell {
    @apply py-3 px-4 text-foreground;
  }
  
  .bernard-table-row {
    @apply border-b border-border transition-colors hover:bg-surface-hover;
  }
}
```

---

### Phase 2: Create Reusable Layout Components

#### 2.1 BernardLayout Component

**File:** `core/src/components/BernardLayout.tsx`

```tsx
interface BernardLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function BernardLayout({ 
  title, 
  description, 
  children, 
  actions,
  className 
}: BernardLayoutProps) {
  return (
    <div className={`px-4 py-6 sm:px-0 ${className || ''}`}>
      <div className="max-w-6xl mx-auto">
        <div className="page-header flex items-center justify-between">
          <div>
            <h1 className="page-title">{title}</h1>
            {description && (
              <p className="page-description">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center space-x-4">
              {actions}
            </div>
          )}
        </div>
        <div className="space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
```

#### 2.2 BernardCard Component

**File:** `core/src/components/BernardCard.tsx`

```tsx
interface BernardCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  hoverable?: boolean;
}

export function BernardCard({
  title,
  description,
  children,
  className,
  headerActions,
  hoverable = false,
}: BernardCardProps) {
  const cardClass = hoverable ? 'bernard-card-hover' : 'bernard-card';
  
  return (
    <div className={`${cardClass} ${className || ''}`}>
      {(title || description || headerActions) && (
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            {title && (
              <h3 className="section-title">{title}</h3>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">
                {description}
              </p>
            )}
          </div>
          {headerActions && (
            <div className="flex items-center space-x-2">
              {headerActions}
            </div>
          )}
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
```

#### 2.3 StatusBadge Component

**File:** `core/src/components/StatusBadge.tsx`

```tsx
interface StatusBadgeProps {
  status: 'online' | 'degraded' | 'offline' | 'queued' | 'running' | 'completed' | 'errored';
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const STATUS_CONFIG = {
  online: { 
    color: 'status-online', 
    label: 'Online',
    lightColor: '#16a34a',
  },
  degraded: { 
    color: 'status-degraded', 
    label: 'Degraded',
    lightColor: '#ca8a04',
  },
  offline: { 
    color: 'status-offline', 
    label: 'Offline',
    lightColor: '#dc2626',
  },
  queued: { 
    color: 'bg-orange-500', 
    label: 'Queued',
    lightColor: '#ea580c',
  },
  running: { 
    color: 'bg-blue-500', 
    label: 'Running',
    lightColor: '#2563eb',
  },
  completed: { 
    color: 'status-online', 
    label: 'Completed',
    lightColor: '#16a34a',
  },
  errored: { 
    color: 'status-offline', 
    label: 'Errored',
    lightColor: '#dc2626',
  },
};

export function StatusBadge({ status, size = 'md', showLabel = true }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-0.5' 
    : 'text-sm px-2.5 py-0.5';
  
  return (
    <span className={`
      inline-flex items-center gap-1.5 rounded-full font-medium capitalize
      ${sizeClasses}
    `}>
      <span className={`status-indicator ${config.color}`} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
```

#### 2.4 ThemeToggle Component (Optional)

**File:** `core/src/components/ThemeToggle.tsx`

```tsx
"use client";

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);
  
  useEffect(() => {
    // Check initial theme
    const isLightMode = document.documentElement.classList.contains('light');
    setIsLight(isLightMode);
  }, []);
  
  const toggleTheme = () => {
    const html = document.documentElement;
    if (isLight) {
      html.classList.remove('light');
      localStorage.theme = 'dark';
    } else {
      html.classList.add('light');
      localStorage.theme = 'light';
    }
    setIsLight(!isLight);
  };
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
    >
      {isLight ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </Button>
  );
}
```

---

### Phase 3: Update Existing Pages

#### 3.1 Update Home Page

**File:** `core/src/app/(dashboard)/bernard/page.tsx`

```tsx
import { BernardLayout } from '@/components/BernardLayout';
import { BernardCard } from '@/components/BernardCard';
import { AuthProvider } from '@/hooks/useAuth';
import { DarkModeProvider } from '@/hooks/useDarkMode';

export default function Home() {
  return (
    <AuthProvider>
      <DarkModeProvider>
        <BernardLayout 
          title="Welcome to Bernard"
          description="Your AI agent platform for home automation and intelligent assistance"
        >
          <BernardCard>
            <p className="text-muted-foreground mb-4">
              Bernard is a production-grade AI agent platform that combines 
              LangGraph-powered reasoning with integrated speech services.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bernard-surface">
                <h3 className="font-semibold mb-2">Quick Actions</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Start a conversation</li>
                  <li>• View task history</li>
                  <li>• Check system status</li>
                </ul>
              </div>
              <div className="bernard-surface">
                <h3 className="font-semibold mb-2">Recent Activity</h3>
                <p className="text-sm text-muted-foreground">
                  No recent conversations. Start chatting to see activity here.
                </p>
              </div>
            </div>
          </BernardCard>
        </BernardLayout>
      </DarkModeProvider>
    </AuthProvider>
  );
}
```

#### 3.2 Update About Page

**File:** `core/src/app/(dashboard)/bernard/about/page.tsx`

```tsx
import { BernardLayout } from '@/components/BernardLayout';
import { BernardCard } from '@/components/BernardCard';

export default function About() {
  return (
    <BernardLayout 
      title="About Bernard"
      description="Technology stack and project information"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BernardCard title="Frontend" description="React + TypeScript">
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• React 18 with TypeScript</li>
            <li>• Next.js 15+ framework</li>
            <li>• Tailwind CSS for styling</li>
            <li>• Framer Motion animations</li>
          </ul>
        </BernardCard>
        
        <BernardCard title="UI Components" description="Accessible primitives">
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Radix-UI primitives</li>
            <li>• Shadcn/ui component library</li>
            <li>• Custom design system</li>
            <li>• Dark mode optimized</li>
          </ul>
        </BernardCard>
        
        <BernardCard title="Backend Services" description="Microservices architecture">
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• LangGraph agent (port 2024)</li>
            <li>• Whisper.cpp STT (port 8870)</li>
            <li>• Kokoro TTS (port 8880)</li>
            <li>• Redis for state (port 6379)</li>
          </ul>
        </BernardCard>
        
        <BernardCard title="Features" description="Core capabilities">
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• AI-powered conversations</li>
            <li>• Home automation tools</li>
            <li>• Media management</li>
            <li>• Real-time status monitoring</li>
          </ul>
        </BernardCard>
      </div>
    </BernardLayout>
  );
}
```

#### 3.3 Update Tasks Page

**File:** `core/src/app/(dashboard)/bernard/tasks/page.tsx`

```tsx
import { BernardLayout } from '@/components/BernardLayout';
import { BernardCard } from '@/components/BernardCard';
import { StatusBadge } from '@/components/StatusBadge';

export default function Tasks() {
  return (
    <BernardLayout 
      title="Tasks"
      description="Monitor background task execution and status"
      actions={/* existing actions */}
    >
      <BernardCard title="Background Tasks" description="View and manage task execution history">
        {/* existing table content - already has good structure */}
      </BernardCard>
    </BernardLayout>
  );
}
```

---

### Phase 4: Create Style Guide Documentation

**File:** `docs/DESIGN_SYSTEM.md`

```markdown
# Bernard Design System

## Overview

The Bernard design system provides a consistent visual language across all UI screens with full light/dark mode support. Colors, typography, and components adapt seamlessly when the user toggles themes.

## Color Palette

### Background Colors

| Mode   | Variable       | Value       | Usage |
|--------|----------------|-------------|-------|
| Dark   | `--background` | `#020617`   | Page background |
| Dark   | `--surface`    | `#1e293b`   | Card backgrounds |
| Dark   | `--surface-hover` | `#334155` | Hover states |
| Light  | `--background` | `#f8fafc`   | Page background |
| Light  | `--surface`    | `#ffffff`   | Card backgrounds |
| Light  | `--surface-hover` | `#f1f5f9` | Hover states |

### Text Colors

| Mode   | Variable            | Value       | Usage |
|--------|---------------------|-------------|-------|
| Dark   | `--foreground`      | `#f8fafc`   | Primary text |
| Dark   | `--muted`           | `#94a3b8`   | Secondary text |
| Dark   | `--muted-foreground` | `#cbd5e1` | Tertiary text |
| Light  | `--foreground`      | `#0f172a`   | Primary text |
| Light  | `--muted`           | `#64748b`   | Secondary text |
| Light  | `--muted-foreground` | `#475569` | Tertiary text |

### Status Colors

| Status     | Dark Mode | Light Mode | Usage |
|------------|-----------|------------|-------|
| Online     | `#22c55e` | `#16a34a`  | Active/running services |
| Degraded   | `#eab308` | `#ca8a04`  | Partial outages |
| Offline    | `#ef4444` | `#dc2626`  | Errors/downtime |
| Queued     | `#f97316` | `#ea580c`  | Pending tasks |
| Running    | `#3b82f6` | `#2563eb`  | In-progress tasks |

### Border Color

| Variable | Value | Usage |
|----------|-------|-------|
| `--border` | `rgba(148, 163, 184, 0.2)` | All borders |

## Typography

| Element | Classes | Example |
|---------|---------|---------|
| Page Title | `text-3xl font-bold text-foreground` | # Welcome |
| Section Title | `text-xl font-semibold text-foreground` | ## Section | `text-base text-foreground` |
| Body Text | Regular text |
| Muted Text | `text-sm text-muted-foreground` | Descriptions |

## Components

### Cards

Use `.bernard-card` for consistent card styling:

```tsx
<bernard-card>
  <h3 className="section-title">Title</h3>
  <p className="text-muted-foreground">Description</p>
</bernard-card>
```

**Variants:**
- `.bernard-card` - Standard card
- `.bernard-card-hover` - Interactive card with hover state

### Surface Containers

Use `.bernard-surface` for nested content areas:

```tsx
<div className="bernard-surface">
  <p>Content with subtle background</p>
</div>
```

### Status Badges

Use `<StatusBadge status="online" />` for consistent status indicators:

```tsx
<StatusBadge status="online" size="md" showLabel={true} />
```

**Available statuses:**
- `online` - Green indicator
- `degraded` - Yellow indicator
- `offline` - Red indicator
- `queued` - Orange indicator
- `running` - Blue indicator
- `completed` - Green indicator
- `errored` - Red indicator

### Layout

Use `<BernardLayout>` for consistent page structure:

```tsx
<BernardLayout 
  title="Page Title"
  description="Optional description"
  actions={<Button>Action</Button>}
>
  <BernardCard>Content</BernardCard>
</BernardLayout>
```

## CSS Utility Classes

| Class | Applies | Usage |
|-------|---------|-------|
| `.bernard-link` | Link styles | Links with hover underline |
| `.bernard-input` | Input styles | Form inputs |
| `.bernard-divider` | Divider styles | Horizontal separators |
| `.bernard-table-header` | Table header styles | TH elements |
| `.bernard-table-cell` | Table cell styles | TD elements |
| `.bernard-table-row` | Table row styles | TR elements |

## Spacing

| Context | Classes |
|---------|---------|
| Page padding | `px-4 py-6 sm:px-0` |
| Card padding | `p-4` |
| Section gap | `space-y-4` |
| Container max-width | `max-w-6xl mx-auto` |

## Dark/Light Mode Implementation

The design system uses CSS custom properties with a `.light` class on the `<html>` element:

```css
:root {
  /* Dark mode (default) */
  --background: #020617;
  --surface: #1e293b;
  --foreground: #f8fafc;
}

.light {
  /* Light mode overrides */
  --background: #f8fafc;
  --surface: #ffffff;
  --foreground: #0f172a;
}
```

Components automatically adapt by referencing these variables:

```css
.bernard-card {
  background: var(--surface);
  color: var(--foreground);
  /* No manual dark/light mode classes needed */
}
```

### Theme Toggle

Add a theme toggle to allow users to switch modes:

```tsx
import { ThemeToggle } from '@/components/ThemeToggle';

<ThemeToggle />
```

## Tailwind Configuration

Ensure your `tailwind.config.js` includes the design system colors:

```javascript
colors: {
  status: {
    online: { DEFAULT: '#22c55e', light: '#16a34a' },
    degraded: { DEFAULT: '#eab308', light: '#ca8a04' },
    offline: { DEFAULT: '#ef4444', light: '#dc2626' },
  },
  surface: {
    DEFAULT: '#1e293b',
    light: '#ffffff',
    hover: { DEFAULT: '#334155', light: '#f1f5f9' },
  },
}
```
```

---

## Implementation Order

| Phase | Task | Files |
|-------|------|-------|
| 1 | Update Tailwind config | `core/tailwind.config.js` |
| 1 | Add CSS design tokens | `core/src/app/globals.css` |
| 2 | Create BernardLayout | `core/src/components/BernardLayout.tsx` |
| 2 | Create BernardCard | `core/src/components/BernardCard.tsx` |
| 2 | Create StatusBadge | `core/src/components/StatusBadge.tsx` |
| 2 | Create ThemeToggle | `core/src/components/ThemeToggle.tsx` |
| 3 | Update /bernard page | `core/src/app/(dashboard)/bernard/page.tsx` |
| 3 | Update /bernard/about page | `core/src/app/(dashboard)/bernard/about/page.tsx` |
| 3 | Update /bernard/tasks page | `core/src/app/(dashboard)/bernard/tasks/page.tsx` |
| 4 | Create design system docs | `docs/DESIGN_SYSTEM.md` |

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1 (Design Tokens + Light Mode) | 1.5 hours |
| Phase 2 (Components) | 2 hours |
| Phase 3 (Page Updates) | 2 hours |
| Phase 4 (Documentation) | 30 minutes |
| **Total** | **~6 hours** |

---

## Benefits

1. **Consistency**: All Bernard UI screens share the same design language
2. **DRY**: Reusable components reduce code duplication
3. **Maintainability**: Single source of truth for design tokens
4. **Full Theme Support**: Seamless light/dark mode with CSS custom properties
5. **Scalability**: New pages can use existing components
6. **Accessibility**: Consistent focus states, colors, and interactions
7. **Smooth Transitions**: CSS transitions for theme switching
