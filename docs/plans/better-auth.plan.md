# OAuth to BetterAuth Migration Plan

**Generated:** January 14, 2026  
**Status:** Planning Phase  
**Author:** Claude (AI Assistant)

## Executive Summary

Replace Bernard's custom OAuth implementation (~2,500 lines) with BetterAuth. All authentication code—API routes, login pages, user profiles—lives in the `core` service. The first user to sign up becomes the admin.

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [BetterAuth Overview](#betterauth-overview)
3. [Migration Plan](#migration-plan)
4. [Environment Variables](#environment-variables)
5. [API Routes Reference](#api-routes-reference)
6. [Database Schema](#database-schema)

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
- **OAuth**: 15+ providers (GitHub, Google, Discord, etc.)
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
│  └── Database adapter                                       │
├─────────────────────────────────────────────────────────────┤
│  Database (PostgreSQL)                                      │
│  ├── users                                                  │
│  ├── sessions                                               │
│  ├── accounts                                               │
│  └── verification_tokens                                    │
└─────────────────────────────────────────────────────────────┘
```

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

**Environment variables:**

```bash
# .env

# Required
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=http://localhost:3456

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/bernard

# Remove these OAuth vars:
# - OAUTH_GITHUB_*
# - OAUTH_GOOGLE_*
```

### Phase 2: Database Schema (Day 2)

Create the BetterAuth schema in `core/src/lib/auth/schema.ts`:

```typescript
import { pgTable, text, timestamp, boolean, uuid, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
]);

export const accounts = pgTable("accounts", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("accounts_user_id_idx").on(table.userId),
]);

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("verification_tokens_identifier_idx").on(table.identifier),
]);
```

### Phase 3: Core Auth Configuration (Day 3)

**Create `core/src/lib/auth/better-auth.ts`:**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer, rateLimit } from "better-auth/plugins";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";

export const auth = betterAuth({
  appName: "Bernard AI Assistant",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "postgresql",
    usePlural: false,
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

### New Required Variables

```bash
# .env

# BetterAuth (NEW - Required)
BETTER_AUTH_SECRET=your-32-char-minimum-secret-key
BETTER_AUTH_URL=http://localhost:3456

# Database (NEW - For BetterAuth)
DATABASE_URL=postgresql://user:password@localhost:5432/bernard
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
# Keep Redis for caching/queues (not auth)
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

## 6. Database Schema

### PostgreSQL Schema

The BetterAuth schema (defined in Phase 2) creates these tables:

| Table | Description |
|-------|-------------|
| `users` | User accounts (id, name, email, isAdmin, etc.) |
| `sessions` | Active sessions (token, expiresAt, userAgent, etc.) |
| `accounts` | OAuth account links (providerId, accessToken, etc.) |
| `verification_tokens` | Email verification and password reset tokens |

### First User = Admin

The first user to sign up is automatically granted admin privileges via the `admin()` plugin. Subsequent users are regular users.

---

## File Structure After Migration

```
core/
├── src/
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── index.ts              # Barrel exports
│   │   │   ├── better-auth.ts        # BetterAuth configuration
│   │   │   ├── schema.ts             # Database schema
│   │   │   └── client.ts             # Frontend auth client
│   │   └── db/                       # Database connection
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

**Document Version:** 1.0  
**Last Updated:** January 14, 2026
