# Bernard UI - React Vite Application

**Generated:** Sun Jan 11 2026
**Commit:** 8b0e23c
**Branch:** dev

## OVERVIEW
React Vite frontend for Bernard AI assistant with shadcn/ui components, streaming chat interface, and admin dashboard.

## STRUCTURE
```
services/bernard-ui/src/
├── components/          # UI components
│   ├── chat/          # Chat-specific components
│   │   ├── Thread.tsx             # Main thread component with streaming
│   │   ├── ConversationHistory.tsx # Sidebar thread list with CRUD
│   │   ├── messages/              # Message rendering
│   │   │   ├── ai.tsx            # Assistant messages + branching
│   │   │   ├── human.tsx         # User messages
│   │   │   ├── tool-calls.tsx    # Tool execution display
│   │   │   ├── progress.tsx      # Streaming progress indicator
│   │   │   └── loading.tsx       # Animated loading state
│   │   ├── BranchSwitcher.tsx      # Branch navigation UI
│   │   ├── markdown-text.tsx       # Markdown renderer (react-markdown)
│   │   └── syntax-highlighter.tsx  # Code block highlighting
│   ├── ui/            # shadcn/ui components (25+ Radix UI wrappers)
│   │   ├── button.tsx             # Button with CVA variants
│   │   ├── dialog.tsx             # Dialog/alert dialogs
│   │   ├── dropdown-menu.tsx      # Dropdown menus
│   │   └── [20+ more primitives]  # Avatar, Card, Input, Table, etc.
│   ├── AdminLayout.tsx             # Admin dashboard layout
│   ├── UserLayout.tsx              # User dashboard layout
│   ├── StatusDashboard.tsx         # Service status monitor
│   ├── DialogManager.tsx           # Dialog context provider
│   └── ToastManager.tsx            # Toast context provider (Sonner)
├── hooks/              # Custom React hooks
├── lib/                # Utilities and helpers
├── pages/              # Page components
│   ├── admin/         # Admin dashboard pages
│   └── bernard/       # Bernard chat interface
├── providers/          # React context providers
├── services/           # API client services
├── test/              # Test setup and utilities
├── types/             # TypeScript type definitions
├── utils/             # Utility functions
├── App.tsx            # Root application component
└── main.tsx           # Vite entry point
```

## WHERE TO LOOK
| Task | Location | Notes |
|-------|----------|-------|
| Chat interface | `pages/bernard/` | Main chat UI with streaming |
| Message rendering | `components/chat/messages/` | Separate files for ai/human/tool |
| Thread management | `components/chat/Thread.tsx` | Streaming, auto-rename, ghost mode |
| Sidebar navigation | `components/chat/ConversationHistory.tsx` | Mobile responsive, thread CRUD |
| Admin dashboard | `pages/admin/` | Services, settings, logs |
| Markdown rendering | `components/chat/markdown-text.tsx` | GFM + MathJax + syntax highlighting |
| UI variants | `components/ui/*/index.ts` | CVA patterns in button, badge, alert |
| API clients | `services/` | Core API service abstraction |
| Context providers | `providers/` | Stream, toast, dialog contexts |
| Custom hooks | `hooks/` | useStream, useServices, etc. |
| Type definitions | `types/` | Shared TypeScript types |

## CONVENTIONS
- **Vite dev server**: Proxies all `/bernard/*` and `/api/*` to `core:3456`
- **Component patterns**: Functional components with named exports, `memo` for optimization, `forwardRef` for composables
- **Styling**: Tailwind CSS + CSS variables (HSL-based) via `hsl(var(--name))` pattern
- **Class merging**: `cn()` utility (clsx + tailwind-merge) for conditional classes
- **Variants**: `cva()` from class-variance-authority for polymorphic components
- **Animations**: Framer Motion with spring physics for smooth transitions
- **Icons**: Lucide React icon library, size prop via `className="h-4 w-4"`
- **Theme**: Dark mode via `class` strategy, CSS variables defined in global styles
- **TypeScript**: Strict typing with inferred props from Radix UI primitives
- **Testing**: Vitest with jsdom, files co-located: `Component.test.tsx`
- **Barrel exports**: `index.ts` files for clean imports
- **Accessibility**: Radix UI primitives provide ARIA attributes automatically
- **No default exports**: Named exports only for tree-shaking
- **Path aliases**: `@/*` → `./src/*`

## COMMANDS
```bash
npm run dev           # Vite dev server (port 8810)
npm run build         # Production build
npm run test          # Vitest (jsdom environment)
npm run test:watch    # Vitest watch mode
npm run lint          # ESLint check
```

## NOTES
- Uses `vite-tsconfig-paths` for `@/*` path resolution
- Tailwind config mirrors core's design system
- Global styles in `index.css` with CSS variables
- Test cleanup in `src/test/setup.ts`
