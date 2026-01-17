# Bernard Design System

## Overview

The Bernard design system uses [shadcn/ui](https://ui.shadcn.com/) components with Tailwind CSS. All pages under `/bernard/*` use the same design patterns as the `/status` page.

## Components Used

### Card Components

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>
```

### Table Components

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column 1</TableHead>
      <TableHead>Column 2</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data 1</TableCell>
      <TableCell>Data 2</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Button Variants

```tsx
import { Button } from '@/components/ui/button';

// Primary
<Button>Default button</Button>

// Outline
<Button variant="outline">Outline</Button>

// Ghost
<Button variant="ghost">Ghost</Button>

// Destructive
<Button variant="destructive">Destructive</Button>

// With icon
<Button variant="outline">
  <RefreshCw className="mr-2 h-4 w-4" />
  Refresh
</Button>
```

### Badge

```tsx
import { Badge } from '@/components/ui/badge';

<Badge variant="outline">Outline</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge>Default</Badge>
```

## CSS Variables

The design system uses CSS custom properties for colors:

### Dark Mode (default)

| Variable | Value | Usage |
|----------|-------|-------|
| `--background` | `#020617` | Page background |
| `--card` | `#1e293b` | Card background |
| `--card-foreground` | `#f8fafc` | Card text |
| `--muted` | `#334155` | Muted backgrounds |
| `--muted-foreground` | `#94a3b8` | Muted text |
| `--primary` | `#3b82f6` | Primary actions |
| `--border` | `rgba(148, 163, 184, 0.2)` | Borders |
| `--ring` | `#3b82f6` | Focus rings |

### Light Mode

| Variable | Value | Usage |
|----------|-------|-------|
| `--background` | `#f8fafc` | Page background |
| `--card` | `#ffffff` | Card background |
| `--card-foreground` | `#0f172a` | Card text |
| `--muted` | `#f1f5f9` | Muted backgrounds |
| `--muted-foreground` | `#64748b` | Muted text |
| `--primary` | `#2563eb` | Primary actions |

## Common Class Patterns

### Page Layout

```tsx
<div className="px-4 py-6 sm:px-0">
  <div className="max-w-3xl mx-auto space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Title</h1>
      <p className="text-gray-600 dark:text-gray-300 mt-1">Description</p>
    </div>
    <Card>...</Card>
  </div>
</div>
```

### Card Content

```tsx
// Secondary background for nested content
<div className="bg-secondary/50 rounded-lg p-4">
  <h3 className="font-semibold text-foreground mb-2">Title</h3>
  <p className="text-sm text-muted-foreground">Content</p>
</div>
```

### Status Colors

- Online: `text-green-500`
- Degraded: `text-yellow-500`
- Offline: `text-red-500`
- Running: `text-blue-500`
- Queued: `text-orange-500`

## File Structure

```
core/
├── src/
│   ├── app/
│   │   └── globals.css         # CSS variables
│   └── components/
│       └── ui/
│           ├── card.tsx        # Card components
│           ├── table.tsx       # Table components
│           ├── button.tsx      # Button component
│           ├── badge.tsx       # Badge component
│           └── ...
```
