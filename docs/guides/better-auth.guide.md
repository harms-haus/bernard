# BetterAuth Configuration Guide

**For:** Bernard AI Assistant  
**Generated:** January 14, 2026

This guide covers how to configure BetterAuth for the Bernard project. All auth code lives in the `core` service.

## Quick Start

### 1. Generate Secret Key

```bash
openssl rand -base64 32
```

Add to `.env`:

```bash
BETTER_AUTH_SECRET=your-generated-secret-here
```

### 2. Set Base URL

```bash
BETTER_AUTH_URL=http://localhost:3456
```

In production:
```bash
BETTER_AUTH_URL=https://bernard.harms.haus
```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `BETTER_AUTH_SECRET` | Encryption key (32+ chars, generate with `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Application base URL (must be accessible from browser) |
| `DATABASE_URL` | PostgreSQL connection string |

### Example .env

```bash
BETTER_AUTH_SECRET=your-32-char-minimum-secret-key-here
BETTER_AUTH_URL=http://localhost:3456
DATABASE_URL=postgresql://user:password@localhost:5432/bernard
```

---

## Configuration File

Location: `core/src/lib/auth/better-auth.ts`

### Minimal Configuration

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL!,
  secret: process.env.BETTER_AUTH_SECRET!,
  database: drizzleAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
});
```

### Complete Configuration

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

  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,      // 1 day
    freshAge: 60 * 10,            // 10 minutes
  },

  rateLimit: {
    enabled: true,
    window: 60,  // 60 seconds
    max: 100,    // 100 requests per window
  },

  plugins: [
    admin(),        // First user becomes admin
    bearer(),       // Bearer token auth for APIs
    rateLimit(),    // Built-in rate limiting
  ],

  advanced: {
    cookiePrefix: "bernard",
    useSecureCookies: process.env.NODE_ENV === "production",
    trustedOrigins: [env.BERNARD_UI_URL],
  },
});
```

---

## Database Adapter

### Drizzle (Recommended)

```typescript
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "postgresql",  // "sqlite" | "mysql" | "pg"
    usePlural: false,        // Use singular table names
  }),
});
```

### Schema

```typescript
// core/src/lib/auth/schema.ts
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
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [index("sessions_user_id_idx").on(table.userId)]);

export const accounts = pgTable("accounts", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("accounts_user_id_idx").on(table.userId)]);

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [index("verification_tokens_identifier_idx").on(table.identifier)]);
```

---

## API Handler

All auth routes are handled by a single file:

```typescript
// core/src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/better-auth";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

This handles:
- `GET/POST /api/auth/signup`
- `GET/POST /api/auth/signin`
- `POST /api/auth/signout`
- `GET /api/auth/session`
- `GET /api/auth/user`
- `POST /api/auth/verify-email`
- `POST /api/auth/forget-password`
- `POST /api/auth/reset-password`

---

## Frontend Client

### Setup

```typescript
// core/src/lib/auth/client.ts
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

### Using in Components

```typescript
"use client";

import { signIn, signUp, signOut, useSession } from "@/lib/auth/client";

function LoginForm() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div>
        <p>Signed in as {session.user.name}</p>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    );
  }

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      await signIn.email({
        email: formData.get("email"),
        password: formData.get("password"),
      });
    }}>
      <input name="email" type="email" placeholder="Email" />
      <input name="password" type="password" placeholder="Password" />
      <button type="submit">Sign In</button>
    </form>
  );
}
```

---

## Middleware

```typescript
// core/src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { auth } from "@/lib/auth/better-auth";

const PUBLIC_PATHS = [
  "/health", "/api/health",
  "/auth", "/bernard", "/bernard/login",
  "/api/proxy-stream", "/api/auth/",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const session = await auth.api.getSession({
    headers: await request.headers(),
  });

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
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

---

## OAuth Providers

### Adding GitHub

```typescript
socialProviders: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
},
```

### Adding Google

```typescript
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
},
```

### Other Providers

BetterAuth supports: Discord, Twitter, Facebook, LinkedIn, Microsoft, Apple, Slack, Twitch, GitLab, Bitbucket, Okta, Auth0, Keycloak, and more.

---

## Plugins

### Admin Plugin

First user to sign up becomes admin automatically.

```typescript
import { admin } from "better-auth/plugins";

plugins: [admin()],
```

### Bearer Token Plugin

For API authentication.

```typescript
import { bearer } from "better-auth/plugins";

plugins: [bearer()],
```

### Rate Limiting

```typescript
import { rateLimit } from "better-auth/plugins";

plugins: [
  rateLimit({
    window: 60,  // 60 seconds
    max: 100,    // 100 requests per window
  }),
],
```

---

## Troubleshooting

### Session Not Persisting

Check that:
1. `BETTER_AUTH_URL` matches your actual URL
2. Cookies are not being blocked
3. `useSecureCookies` matches your environment (true for HTTPS)

### Cannot Sign In

Verify:
1. Database connection is working
2. User exists in database
3. Password is hashed correctly (bcrypt)
4. Rate limiting is not blocking requests

### Redirect Loops

Check middleware PUBLIC_PATHS includes your auth routes.

### Admin Not Working

The first user to sign up becomes admin. No manual configuration needed.

---

## Testing

### Sign Up

```typescript
const result = await signUp.email({
  email: "test@example.com",
  password: "securePassword123",
  name: "Test User",
});
```

### Sign In

```typescript
const result = await signIn.email({
  email: "test@example.com",
  password: "securePassword123",
});
```

### Get Session

```typescript
const { data: session } = await authClient.getSession();
if (session) {
  console.log(session.user.name);
  console.log(session.user.isAdmin);
}
```

### Sign Out

```typescript
await signOut();
```

---

**Guide Version:** 1.0  
**Last Updated:** January 14, 2026
