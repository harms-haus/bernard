# OAuth to BetterAuth Migration Plan

https://www.better-auth.com/llms.txt

**Generated:** January 14, 2026  
**Status:** Planning Phase (Revised)  
**Author:** Claude (AI Assistant)

## Executive Summary

Replace Bernard's custom OAuth implementation (~2,500 lines) with BetterAuth using a **custom Redis adapter**. All authentication code—API routes, login pages, user profiles—lives in the `core` service. The first user to sign up becomes the admin.

**Key Decision:** Use Redis as the primary database (not PostgreSQL) by implementing a custom BetterAuth adapter. This keeps the architecture simple and avoids adding new infrastructure.

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [BetterAuth Overview](#betterauth-overview)
3. [Migration Plan](#migration-plan)
4. [Environment Variables](#environment-variables)
5. [API Routes Reference](#api-routes-reference)
6. [Custom Redis Adapter](#custom-redis-adapter)
7. [Database Schema (Redis)](#database-schema-redis)

---

## 1. Current System Analysis

### 1.1 Architecture Overview

| Component | Technology |
|-----------|------------|
| **Auth Library** | Custom (no third-party) |
| **Session Storage** | Redis |
| **OAuth Flow** | Custom PKCE (S256) |
| **Providers** | GitHub, Google |
| **Token Format** | Session cookies + API tokens |
| **User Storage** | Redis hashes |

### 1.2 Current File Structure (to be removed)

```
core/src/lib/auth/
├── index.ts              # Barrel exports
├── types.ts              # UserRecord, SessionRecord, OAuthProvider
├── session.ts            # Cookie handling, getCurrentUser
├── sessionStore.ts       # Redis session storage
├── userStore.ts          # Redis user storage
├── tokenStore.ts         # API token management
├── oauth.ts              # OAuth state, token exchange
├── oauthCore.ts          # PKCE helpers
├── authCore.ts           # Store factory, resolveSession
├── adminAuth.ts          # Admin API key authentication
├── helpers.ts            # bearerToken, requireAuth
└── validation.ts         # Login body validation

API Routes:
├── app/api/auth/route.ts          # Main auth handler
├── app/api/auth/login/route.ts    # Login initiation
├── app/api/auth/logout/route.ts   # Logout handler
├── app/api/auth/me/route.ts       # Current user endpoint
├── app/auth/login/page.tsx        # Login UI
└── app/auth/github/callback/route.ts
```

### 1.3 Current Environment Variables

```bash
# Redis (required)
REDIS_URL=redis://127.0.0.1:6379

# GitHub OAuth
OAUTH_GITHUB_CLIENT_ID=...
OAUTH_GITHUB_CLIENT_SECRET=...
OAUTH_GITHUB_REDIRECT_URI=...

# Google OAuth
OAUTH_GOOGLE_CLIENT_ID=...
OAUTH_GOOGLE_CLIENT_SECRET=...

# Admin
ADMIN_API_KEY=...
```

---

## 2. BetterAuth Overview

BetterAuth is a comprehensive authentication framework for TypeScript with:

- **Email & Password**: Built-in with bcrypt hashing
- **OAuth**: 70+ providers (GitHub, Google, Discord, etc.)
- **Two-Factor Authentication**: TOTP-based 2FA
- **Passkeys**: WebAuthn passkey support
- **Organizations**: Multi-tenant with roles
- **Multi-Session**: Multiple concurrent sessions
- **Bearer Tokens**: API token authentication
- **Rate Limiting**: Built-in abuse prevention

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BetterAuth Architecture                   │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React - in core)                                 │
│  ├── AuthProvider context                                   │
│  ├── Login/Signup pages                                     │
│  └── useAuth hook                                           │
├─────────────────────────────────────────────────────────────┤
│  Next.js API Routes (all in core)                           │
│  └── [...all]/route.ts (handles all auth endpoints)        │
├─────────────────────────────────────────────────────────────┤
│  BetterAuth Server (in core)                                │
│  ├── betterAuth() configuration                             │
│  ├── Plugins (admin, bearer, rate-limit)                    │
│  └── Custom Redis adapter                                   │
├─────────────────────────────────────────────────────────────┤
│  Redis (Primary Database - Existing)                        │
│  ├── auth:user:<id>        (Hash - user data)              │
│  ├── auth:email:<email>    (String - email→id mapping)     │
│  ├── auth:session:<id>     (Hash - session data)           │
│  ├── auth:account:<id>     (Hash - OAuth accounts)         │
│  └── auth:verification:<id> (Hash - verification tokens)   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Why Redis?

- **Already running**: Redis is part of the existing infrastructure
- **No new dependencies**: No PostgreSQL setup required
- **Performance**: In-memory storage is fast
- **Familiar**: Team already understands Redis patterns

---

## 3. Migration Plan

### Phase 1: Setup (Day 1)

**Install dependencies:**

```bash
cd core
npm install better-auth better-auth/client
npm install bcrypt
npm install @types/bcrypt
```

**Environment variables (no changes to REDIS_URL needed):**

```bash
# .env

# Required
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=http://localhost:3456

# Keep existing Redis (no DATABASE_URL needed)
REDIS_URL=redis://127.0.0.1:6379

# Remove these OAuth vars:
# - OAUTH_GITHUB_*
# - OAUTH_GOOGLE_*
```

### Phase 2: Custom Redis Adapter (Day 2)

**Create `core/src/lib/auth/redis-adapter.ts`:**

```typescript
import { createAdapterFactory, Where } from "@better-auth/core/db/adapter";
import { Redis } from "ioredis";

interface RedisAdapterConfig {
  client: Redis;
  keyPrefix?: string;
}

/**
 * Generate a Redis key for a given model and ID
 */
function makeKey(prefix: string, model: string, id: string): string {
  return `${prefix}${model}:${id}`;
}

/**
 * Create a custom Redis adapter for BetterAuth
 * Uses Redis hashes for storage with secondary indexes for email lookups
 */
export function redisAdapter(client: Redis, config: RedisAdapterConfig) {
  const keyPrefix = config.keyPrefix || "auth:";

  const createCustomAdapter = () => {
    /**
     * Convert BetterAuth where clauses to Redis data
     */
    function convertWhere(where: Where[], data: Record<string, unknown>): boolean {
      return where.every((w) => {
        const value = data[w.field];
        switch (w.operator) {
          case undefined:
          case "eq":
            return value === w.value;
          case "ne":
            return value !== w.value;
          case "gt":
            return (value as number) > (w.value as number);
          case "gte":
            return (value as number) >= (w.value as number);
          case "lt":
            return (value as number) < (w.value as number);
          case "lte":
            return (value as number) <= (w.value as number);
          case "in":
            return Array.isArray(w.value) && w.value.includes(value);
          case "not_in":
            return Array.isArray(w.value) && !w.value.includes(value);
          case "contains":
            return String(value).includes(String(w.value));
          case "starts_with":
            return String(value).startsWith(String(w.value));
          case "ends_with":
            return String(value).endsWith(String(w.value));
          default:
            return value === w.value;
        }
      });
    }

    return {
      /**
       * Create a new record
       */
      async create({ model, data }) {
        const id = crypto.randomUUID();
        const key = makeKey(keyPrefix, model, id);
        
        // Store all data as hash
        await client.hset(key, data as Record<string, string>);
        
        // Create secondary index for email lookups
        if (model === "user" && data.email) {
          await client.set(`${keyPrefix}email:${data.email}`, id);
        }
        
        return { id, ...data };
      },

      /**
       * Find a single record by where clause
       */
      async findOne({ model, where }) {
        // Handle ID lookup (most common case - fast path)
        if (where.length === 1 && where[0].field === "id") {
          const key = makeKey(keyPrefix, model, where[0].value);
          const data = await client.hgetall(key);
          return Object.keys(data).length > 0 ? data : null;
        }

        // Handle email lookup for users (uses secondary index)
        if (where.length === 1 && where[0].field === "email" && model === "user") {
          const id = await client.get(`${keyPrefix}email:${where[0].value}`);
          if (!id) return null;
          const key = makeKey(keyPrefix, model, id);
          const data = await client.hgetall(key);
          return Object.keys(data).length > 0 ? data : null;
        }

        // Fallback: scan all keys (inefficient - use sparingly)
        // Note: For production, consider RediSearch for complex queries
        const pattern = makeKey(keyPrefix, model, "*");
        const keys = await client.keys(pattern);
        
        for (const key of keys) {
          const data = await client.hgetall(key);
          if (convertWhere(where, data)) {
            return data;
          }
        }
        
        return null;
      },

      /**
       * Find multiple records
       */
      async findMany({ model, where, limit = 100, offset = 0 }) {
        const pattern = makeKey(keyPrefix, model, "*");
        const keys = await client.keys(pattern);
        const results: Record<string, unknown>[] = [];

        for (const key of keys.slice(offset, offset + limit)) {
          const data = await client.hgetall(key);
          if (!where || where.length === 0) {
            results.push(data);
          } else if (convertWhere(where, data)) {
            results.push(data);
          }
        }

        return results;
      },

      /**
       * Count records
       */
      async count({ model, where }) {
        const pattern = makeKey(keyPrefix, model, "*");
        const keys = await client.keys(pattern);
        
        if (!where || where.length === 0) {
          return keys.length;
        }

        let count = 0;
        for (const key of keys) {
          const data = await client.hgetall(key);
          if (convertWhere(where, data)) {
            count++;
          }
        }
        
        return count;
      },

      /**
       * Update a record
       */
      async update({ model, where, update: values }) {
        const result = await this.findOne({ model, where });
        if (!result) return null;

        const key = makeKey(keyPrefix, model, result.id);
        await client.hset(key, values as Record<string, string>);
        
        // Update email index if email changed
        if (model === "user" && values.email && result.email !== values.email) {
          await client.set(`${keyPrefix}email:${values.email}`, result.id);
          await client.del(`${keyPrefix}email:${result.email}`);
        }

        return { ...result, ...values };
      },

      /**
       * Update multiple records
       */
      async updateMany({ model, where, update: values }) {
        const results = await this.findMany({ model, where });
        let count = 0;

        for (const result of results) {
          const key = makeKey(keyPrefix, model, result.id);
          await client.hset(key, values as Record<string, string>);
          count++;
        }

        return count;
      },

      /**
       * Delete a record
       */
      async delete({ model, where }) {
        const result = await this.findOne({ model, where });
        if (!result) return;

        const key = makeKey(keyPrefix, model, result.id);
        await client.del(key);

        // Clean up secondary indexes
        if (model === "user" && result.email) {
          await client.del(`${keyPrefix}email:${result.email}`);
        }
      },

      /**
       * Delete multiple records
       */
      async deleteMany({ model, where }) {
        const results = await this.findMany({ model, where });
        let count = 0;

        for (const result of results) {
          await this.delete({ model, where: [{ field: "id", value: result.id }] });
          count++;
        }

        return count;
      },
    };
  };

  const adapterOptions = {
    config: {
      adapterId: "redis",
      adapterName: "Redis Adapter",
      usePlural: false,
      debugLogs: false,
      supportsUUIDs: true,
      supportsJSON: true,
      supportsArrays: false,
      transaction: false, // Redis doesn't support transactions like SQL
    },
    adapter: createCustomAdapter(),
  };

  const adapter = createAdapterFactory(adapterOptions);

  return (options: { appName: string; advanced: { cookiePrefix: string } }) => {
    return adapter(options);
  };
}
```

### Phase 3: Core Auth Configuration (Day 3)

**Create `core/src/lib/auth/better-auth.ts`:**

```typescript
import { betterAuth } from "better-auth";
import { redisAdapter } from "./redis-adapter";
import { admin, bearer, rateLimit } from "better-auth/plugins";
import bcrypt from "bcrypt";
import { redisClient } from "@/lib/infra/redis";
import { env } from "@/lib/config/env";

export const auth = betterAuth({
  appName: "Bernard AI Assistant",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: redisAdapter(redisClient, {
    keyPrefix: "auth:",
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    requireEmailVerification: false,
    password: {
      hash: async (password) => await bcrypt.hash(password, 12),
      verify: async ({ hash, password }) => await bcrypt.compare(password, hash),
    },
  },

  socialProviders: {
    // github: { ... },
    // google: { ... },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // 1 day
    freshAge: 60 * 10,           // 10 minutes
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },

  plugins: [
    admin(),
    bearer(),
    rateLimit(),
  ],

  advanced: {
    cookiePrefix: "bernard",
    useSecureCookies: process.env.NODE_ENV === "production",
    trustedOrigins: [env.BERNARD_UI_URL],
  },
});
```

### Phase 4: API Handler (Day 4)

**Create `core/src/app/api/auth/[...all]/route.ts`:**

```typescript
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/better-auth";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

### Phase 5: Middleware (Day 5)

**Update `core/src/middleware.ts`:**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { auth } from "@/lib/auth/better-auth";

const PUBLIC_PATHS = [
  "/health", "/api/health", "/api/proxy-stream",
  "/auth", "/bernard", "/bernard/", "/bernard/login",
  "/bernard/api/", "/bernard/api/auth/"
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await auth.api.getSession({
    headers: await request.headers(),
  });

  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-user-id", session.user.id);
  response.headers.set("x-user-email", session.user.email);
  response.headers.set("x-user-name", session.user.name);
  response.headers.set("x-user-admin", String(session.user.isAdmin ?? false));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
```

### Phase 6: Frontend (Day 6-7)

**Create `core/src/lib/auth/client.ts`:**

```typescript
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;
```

**Create `core/src/app/auth/login/page.tsx`:**

```typescript
"use client";

import { useState } from "react";
import { signIn, signUp, signOut, useSession } from "@/lib/auth/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");

  if (session) {
    return (
      <div className="p-8">
        <h1 className="text-2xl mb-4">Welcome, {session.user.name}</h1>
        <p className="mb-4">Email: {session.user.email}</p>
        <p className="mb-4">Admin: {session.user.isAdmin ? "Yes" : "No"}</p>
        <button onClick={() => signOut()} className="bg-red-600 text-white px-4 py-2 rounded">
          Sign Out
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const result = isSignUp
      ? await signUp.email({ email, password, name })
      : await signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else {
      router.push("/bernard/chat");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full bg-white p-8 rounded shadow">
        <h1 className="text-2xl mb-6">{isSignUp ? "Create Account" : "Sign In"}</h1>

        {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border p-2 rounded"
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
            {isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="mt-4 text-blue-600 text-sm"
        >
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
      </div>
    </div>
  );
}
```

### Phase 7: Admin User Logic (Day 8)

The first user to sign up is automatically the admin. This is handled by the `admin()` plugin:

```typescript
// In better-auth.ts, the admin plugin handles first user detection automatically
plugins: [
  admin(), // First user becomes admin
  bearer(),
  rateLimit(),
],
```

### Phase 8: Cleanup (Day 9)

Remove the old auth files:

```bash
rm -rf core/src/lib/auth/oauth*
rm -rf core/src/lib/auth/sessionStore.ts
rm -rf core/src/lib/auth/userStore.ts
rm -rf core/src/lib/auth/tokenStore.ts
rm -rf core/src/lib/auth/authCore.ts
rm -rf core/src/lib/auth/adminAuth.ts
rm -rf core/src/lib/auth/helpers.ts
rm -rf core/src/lib/auth/validation.ts
rm -f core/src/app/api/auth/login/route.ts
rm -f core/src/app/api/auth/logout/route.ts
rm -f core/src/app/api/auth/me/route.ts
rm -f core/src/app/auth/github/callback/route.ts
rm -f core/src/app/auth/google/callback/route.ts
```

---

## 4. Environment Variables

### Variables to Update

```bash
# .env

# BetterAuth (NEW - Required)
BETTER_AUTH_SECRET=your-32-char-minimum-secret-key
BETTER_AUTH_URL=http://localhost:3456

# Keep Redis (existing - used for auth data)
REDIS_URL=redis://127.0.0.1:6379
```

### Variables to Remove

```bash
# Remove these OAuth variables entirely:
OAUTH_GITHUB_CLIENT_ID
OAUTH_GITHUB_CLIENT_SECRET
OAUTH_GITHUB_REDIRECT_URI
OAUTH_GOOGLE_CLIENT_ID
OAUTH_GOOGLE_CLIENT_SECRET
OAUTH_GOOGLE_REDIRECT_URI
```

### Variables to Keep

```bash
# Keep Redis for auth + caching/queues
REDIS_URL=redis://127.0.0.1:6379

# Keep service URLs
BERNARD_API_URL=http://localhost:3456
VLLM_URL=http://localhost:8860
WHISPER_URL=http://localhost:8870
KOKORO_URL=http://localhost:8880
BERNARD_UI_URL=http://localhost:8810
```

---

## 5. API Routes Reference

All auth routes handled by single handler in `core/src/app/api/auth/[...all]/route.ts`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/signup` | Get signup options |
| POST | `/api/auth/signup` | Create new account |
| GET | `/api/auth/signin` | Get signin options |
| POST | `/api/auth/signin` | Sign in with credentials |
| POST | `/api/auth/signout` | Sign out |
| GET | `/api/auth/session` | Get current session |
| GET | `/api/auth/user` | Get user profile |
| POST | `/api/auth/verify-email` | Send email verification |
| POST | `/api/auth/forget-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |

---

## 6. Custom Redis Adapter

### Key Design Decisions

1. **Redis Hashes**: All records stored as Redis hashes for efficient field access
2. **Secondary Indexes**: Email → user ID mapping for fast lookups
3. **Key Prefix**: All keys prefixed with `auth:` for easy identification
4. **No Transactions**: Redis doesn't support ACID transactions like SQL

### Redis Key Structure

```
auth:user:<uuid>           # Hash - user data (name, email, image, isAdmin, etc.)
auth:email:<email>         # String - email to user ID mapping
auth:session:<uuid>        # Hash - session data (token, expiresAt, userAgent, etc.)
auth:account:<uuid>        # Hash - OAuth account data (providerId, accessToken, etc.)
auth:verification:<uuid>   # Hash - verification tokens (identifier, value, expiresAt)
```

### Performance Considerations

| Operation | Method | Complexity |
|-----------|--------|------------|
| Find by ID | Direct hash lookup | O(1) |
| Find by email | Secondary index lookup | O(1) |
| Find many | SCAN + filter | O(N) |
| Count | SCAN + filter | O(N) |

**Production Note:** For high-traffic deployments with complex queries, consider adding RediSearch module for efficient indexing and queries.

---

## 7. File Structure After Migration

```
core/
├── src/
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── index.ts              # Barrel exports
│   │   │   ├── better-auth.ts        # BetterAuth configuration
│   │   │   ├── redis-adapter.ts      # Custom Redis adapter
│   │   │   └── client.ts             # Frontend auth client
│   │   └── infra/
│   │       └── redis.ts              # Redis client (existing)
│   ├── app/
│   │   ├── api/
│   │   │   └── auth/[...all]/
│   │   │       └── route.ts          # All auth API routes
│   │   └── auth/
│   │       └── login/
│   │           └── page.tsx          # Login/Signup UI
│   └── middleware.ts                 # Route protection
├── .env                              # BETTER_AUTH_* vars
└── package.json                      # better-auth dependency
```

---

## Appendix A: Redis Data Model

### User Record
```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "emailVerified": "false",
  "image": "https://...",
  "isAdmin": "false",
  "createdAt": "2026-01-14T...",
  "updatedAt": "2026-01-14T..."
}
```

### Session Record
```json
{
  "id": "uuid",
  "userId": "uuid",
  "token": "session-token",
  "expiresAt": "2026-01-21T...",
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "createdAt": "2026-01-14T...",
  "updatedAt": "2026-01-14T..."
}
```

### Account Record
```json
{
  "id": "uuid",
  "userId": "uuid",
  "accountId": "github-12345",
  "providerId": "github",
  "accessToken": "ghp_...",
  "refreshToken": "...",
  "idToken": "...",
  "accessTokenExpiresAt": "...",
  "refreshTokenExpiresAt": "...",
  "scope": "read:user user:email",
  "createdAt": "2026-01-14T...",
  "updatedAt": "2026-01-14T..."
}
```

### Verification Token Record
```json
{
  "id": "uuid",
  "identifier": "john@example.com",
  "value": "token-value",
  "expiresAt": "2026-01-15T...",
  "createdAt": "2026-01-14T..."
}
```

---

**Document Version:** 2.0 (Revised for Redis)  
**Last Updated:** January 14, 2026
