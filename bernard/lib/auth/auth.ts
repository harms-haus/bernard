import type { NextRequest } from "next/server";
import type Redis from "ioredis";

import { SessionStore } from "./sessionStore";
import { UserStore, type UserRecord } from "./userStore";
import { getRedis } from "../infra/redis";
import { TokenStore } from "./tokenStore";

export type AuthenticatedUser = {
  user: UserRecord;
  sessionId: string | null;
};

const SESSION_COOKIE = "bernard_session";
type AuthStores = { redis: Redis; sessionStore: SessionStore; userStore: UserStore };

export type AccessGrant = {
  token: string;
  source: "api-token" | "session";
  user?: UserRecord;
};

/**
 * Extract the bearer token from an Authorization header.
 * Returns null when the header is absent, not bearer, or missing a token value.
 */
export function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

const buildStores = (redis?: Redis): AuthStores => {
  const client = redis ?? getRedis();
  return {
    redis: client,
    sessionStore: new SessionStore(client),
    userStore: new UserStore(client)
  };
};

const resolveSession = async (sessionId: string, stores: AuthStores): Promise<AuthenticatedUser | null> => {
  const session = await stores.sessionStore.get(sessionId);
  if (!session) return null;

  const user = await stores.userStore.get(session.userId);
  if (!user) {
    await stores.sessionStore.delete(sessionId, session.userId);
    return null;
  }

  if (user.status !== "active") {
    await stores.sessionStore.delete(sessionId, session.userId);
    return null;
  }

  return { user, sessionId: session.id };
};

const isAdminBearer = (req: NextRequest) => {
  const adminKey = process.env["ADMIN_API_KEY"];
  if (!adminKey) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === adminKey;
};

/**
 * Resolve an authenticated user from the session cookie, if present.
 * Accepts an optional Redis client to aid testing or dependency injection.
 */
export async function getAuthenticatedUser(req: NextRequest, redis?: Redis): Promise<AuthenticatedUser | null> {
  console.log('🔍 Auth: getAuthenticatedUser called');
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  console.log('🔍 Auth: Session cookie:', sessionCookie ? 'present' : 'missing');
  
  if (!sessionCookie) {
    console.log('🔍 Auth: No session cookie, checking for admin API key');
    // Check if this is an admin request with ADMIN_API_KEY
    if (isAdminBearer(req)) {
      console.log('✅ Auth: Admin API key detected');
      const now = new Date().toISOString();
      return {
        user: {
          id: "admin-token",
          displayName: "Admin Token",
          isAdmin: true,
          status: "active",
          createdAt: now,
          updatedAt: now
        },
        sessionId: null
      };
    }
    return null;
  }
  
  const stores = buildStores(redis);
  console.log('🔍 Auth: Resolving session with Redis');
  const result = await resolveSession(sessionCookie, stores);
  console.log('🔍 Auth: Session resolution result:', result ? 'success' : 'failed');
  return result;
}

/**
 * Require an admin user either via ADMIN_API_KEY bearer token or an admin session cookie.
 * Returns the authenticated admin user or null when not authorized.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthenticatedUser | null> {
  if (isAdminBearer(req)) {
    const now = new Date().toISOString();
    return {
      user: {
        id: "admin-token",
        displayName: "Admin Token",
        isAdmin: true,
        status: "active",
        createdAt: now,
        updatedAt: now
      },
      sessionId: null
    };
  }

  const sessionUser = await getAuthenticatedUser(req);
  if (!sessionUser) return null;
  if (!sessionUser.user.isAdmin) return null;
  return sessionUser;
}

/**
 * Build a Set-Cookie header value for a session with secure attributes.
 */
export function buildSessionCookie(sessionId: string, maxAgeSeconds: number) {
  const secure = process.env["NODE_ENV"] === "production";
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build a Set-Cookie header value that immediately clears the session.
 */
export function clearSessionCookie() {
  const secure = process.env["NODE_ENV"] === "production";
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Validate and sanitize a redirect URL to prevent open-redirect vulnerabilities.
 * Allows relative paths (starting with "/") or absolute URLs with allowed hostnames.
 * Returns "/" as fallback for invalid redirects.
 */
export function validateRedirectUrl(redirect: string): string {
  // Default to "/" if no redirect provided
  if (!redirect || typeof redirect !== "string") {
    return "/";
  }

  // Check for control characters (including null bytes, newlines, etc.)
  if (/[\x00-\x1F\x7F]/.test(redirect)) {
    console.warn("Redirect validation failed: contains control characters");
    return "/";
  }

  // Allow relative paths (must start with "/")
  if (redirect.startsWith("/")) {
    // Ensure it doesn't start with "//" (protocol-relative URLs)
    if (redirect.startsWith("//")) {
      console.warn("Redirect validation failed: protocol-relative URL not allowed");
      return "/";
    }
    return redirect;
  }

  // For absolute URLs, parse and validate hostname
  try {
    const url = new URL(redirect);

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(url.protocol)) {
      console.warn(`Redirect validation failed: invalid protocol ${url.protocol}`);
      return "/";
    }

    // Get allowed hosts from environment
    const allowedHostsEnv = process.env["ALLOWED_REDIRECT_HOSTS"];
    if (!allowedHostsEnv) {
      console.warn("Redirect validation failed: ALLOWED_REDIRECT_HOSTS not configured");
      return "/";
    }

    // Parse comma-separated hosts, trim whitespace, and convert to lowercase
    const allowedHosts = allowedHostsEnv
      .split(",")
      .map(host => host.trim().toLowerCase())
      .filter(host => host.length > 0);

    // Check if the URL hostname matches any allowed host (case-insensitive)
    const redirectHost = url.hostname.toLowerCase();
    if (!allowedHosts.includes(redirectHost)) {
      console.warn(`Redirect validation failed: hostname ${redirectHost} not in allowed hosts [${allowedHosts.join(", ")}]`);
      return "/";
    }

    return redirect;
  } catch (error) {
    console.warn("Redirect validation failed: invalid URL format", error);
    return "/";
  }
}

/**
 * Validate access using an API bearer token or session cookie.
 * Returns an AccessGrant on success or a 401 Response on failure.
 */
export async function validateAccessToken(
  req: NextRequest,
  opts?: { redis?: Redis }
): Promise<{ access: AccessGrant } | { error: Response }> {
  const bearer = bearerToken(req);
  const cookieSessionId = req.cookies.get(SESSION_COOKIE)?.value;

  // Short-circuit before touching Redis when no credentials are present.
  if (!bearer && !cookieSessionId) {
    return { error: new Response(JSON.stringify({ error: "Missing bearer or session token" }), { status: 401 }) };
  }

  const stores = buildStores(opts?.redis);
  const tokenStore = new TokenStore(stores.redis);

  const sessionAccess = async (sessionId?: string | null): Promise<AccessGrant | null> => {
    if (!sessionId) return null;
    const sessionUser = await resolveSession(sessionId, stores);
    if (!sessionUser) return null;
    return { token: sessionId, source: "session", user: sessionUser.user };
  };

  if (bearer) {
    const token = await tokenStore.validate(bearer);
    if (token) {
      return { access: { token: bearer, source: "api-token" } };
    }
    const session = await sessionAccess(bearer);
    if (session) {
      return { access: session };
    }
    return { error: new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 }) };
  }

  const cookieSession = await sessionAccess(cookieSessionId);
  if (cookieSession) {
    return { access: cookieSession };
  }

  return { error: new Response(JSON.stringify({ error: "Missing bearer or session token" }), { status: 401 }) };
}

