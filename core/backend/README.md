# Backend Server (Hono)

This directory contains the Hono-based backend server that will replace Next.js API routes.

## Structure

```
backend/
├── server.ts              # Main Hono app entry point
├── config.ts              # Server configuration
├── types.ts               # TypeScript type definitions for Hono context
├── middleware/
│   ├── auth.ts            # Authentication middleware (Better-Auth integration)
│   ├── cors.ts             # CORS configuration
│   └── errorHandler.ts     # Global error handler
├── routes/
│   └── index.ts           # Route registry (to be populated in Phase 2)
└── utils/
    └── (to be created)     # Utility functions (proxy, etc.)
```

## Features Implemented (Phase 1)

✅ **Core Server Setup**
- Hono app with logger middleware
- CORS configuration with allowlist
- Error handling middleware
- Health check endpoint
- Static asset serving (production)

✅ **Authentication Middleware**
- Better-Auth integration
- Protected route checking
- Admin role verification
- Session management in context

✅ **Route Protection**
- Public routes (no auth required)
- Protected routes (auth required)
- Admin routes (admin role required)
- Frontend route protection (not API routes)

## Development

The server is configured to work with `@hono/vite-dev-server` for unified frontend + backend development on port 3456.

## Production

For production, the server exports a Bun-compatible fetch handler that can be used with Bun's built-in server.
