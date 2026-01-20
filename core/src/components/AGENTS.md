# Components - UI Library

**Generated:** 2026-01-19
**Commit:** 7e4a504
**Branch:** dev

## OVERVIEW
React UI components for Bernard dashboard - shadcn/ui derivatives, dialog/toast managers, dark mode toggle, and dynamic header/sidebar.

## STRUCTURE
```
core/src/components/
├── ui/                    # Base UI components (card, dialog, toast, etc.)
├── DarkModeToggle.tsx     # Theme switcher
├── DialogManager.tsx      # Dialog state management + hooks
└── ToastManager.tsx       # Toast notification system
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Base UI | `ui/` | shadcn/ui components (card, dialog, toast) |
| Dialogs | `DialogManager.tsx` | Provider + useDialogManager hook |
| Toasts | `ToastManager.tsx` | Provider + useToastManager hook |
| Theme | `DarkModeToggle.tsx` | Dark mode toggle button |

## EXPORTS
| Export | Type | Purpose |
|--------|------|---------|
| Card* | component | Content containers |
| Dialog* | component | Modal dialogs |
| Toast* | component | Notifications |
| DarkModeToggle | component | Theme switcher |
| useDialogManager | hook | Dialog state |
| useToastManager | hook | Toast state |
| useConfirmDialog | hook | Confirmation dialog |

## PATTERNS
- **Tailwind + CSS variables**: Colors via `--color-*` vars
- **Component composition**: Providers wrap children
- **Shadcn/ui derivatives**: Modified base components

## ANTI-PATTERNS
- NO direct UI logic in components (use hooks)
- NO hardcoded colors (use CSS vars)
