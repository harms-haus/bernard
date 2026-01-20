# Hooks - Custom React Hooks

**Generated:** 2026-01-19
**Commit:** 7e4a504
**Branch:** dev

## OVERVIEW
12 custom React hooks for Bernard dashboard - authentication, service status, chat input, threading, dark mode, and logging.

## HOOKS
| Hook | Purpose |
|------|---------|
| useAuth | Better-Auth session + user state |
| useAdminAuth | Admin role verification |
| useServiceStatus | Real-time service health polling |
| useService | Single service status |
| useLogStream | Process log streaming |
| useHealthStream | Health check streaming |
| useChatInput | Chat message input state |
| useThreadData | LangGraph thread management |
| useAutoRename | Auto-rename threads |
| useDarkMode | Theme state + provider |
| useConfirmDialogPromise | Promise-based confirm dialog |
| useAssistantMessageData | Assistant message rendering |

## PATTERNS
- **Singleton providers**: AuthProvider, DarkModeProvider wrap app
- **Auto-refresh**: useServiceStatus polls every 3s by default
- **Promise hooks**: useConfirmDialogPromise for async confirm
- **Stream hooks**: useLogStream/useHealthStream for real-time data

## ANTI-PATTERNS
- NO direct API calls in hooks (use lib/ services)
- NO manual polling (use auto-refresh options)
- NO hardcoded intervals (use config params)

## FILE REFERENCES
| File | Purpose |
|------|---------|
| `index.ts` | Barrel exports |
| `useAuth.ts` | Auth + admin + session |
| `useServiceStatus.ts` | Health polling |
| `useLogStream.ts` | Log streaming |
| `useChatInput.ts` | Input state |
| `useThreadData.ts` | Thread CRUD |
