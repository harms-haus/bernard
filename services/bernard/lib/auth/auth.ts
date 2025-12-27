import type { NextRequest } from "next/server";
import type Redis from "ioredis";
import { 
  buildStores as buildSharedStores,
  resolveSession as resolveSharedSession,
  getAdminUser,
  validateToken,
  validateRedirect
} from "@shared/auth/index";
import type { 
  AuthenticatedUser,
  AccessGrant
} from "@shared/auth/index";
import { getRedis } from "@/lib/infra/redis";
import { logger } from "@/lib/logging";

export type { AuthenticatedUser, AccessGrant };

const SESSION_COOKIE = "bernard_session";

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

export const buildStores = (redis?: Redis) => buildSharedStores(redis ?? getRedis());

/**
 * Resolve an authenticated user from the session cookie, if present.
 * Accepts an optional Redis client to aid testing or dependency injection.
 */
export async function getAuthenticatedUser(req: NextRequest, redis?: Redis): Promise<AuthenticatedUser | null> {
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  const bearer = bearerToken(req);

  if (!sessionCookie && !bearer) {
    // Check if this is an admin request with ADMIN_API_KEY
    const admin = getAdminUser(process.env["ADMIN_API_KEY"], bearer);
    if (admin) {
      logger.info({ event: 'auth.admin_key.detected' }, '✅ Auth: Admin API key detected');
      return admin;
    }
    return null;
  }
  
  const stores = buildStores(redis);
  const sessionId = bearer || sessionCookie;
  
  if (sessionId) {
    const result = await resolveSharedSession(sessionId, stores);
    if (result) return result;
  }

  return null;
}

/**
 * Require an admin user either via ADMIN_API_KEY bearer token or an admin session cookie.
 * Returns the authenticated admin user or null when not authorized.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthenticatedUser | null> {
  const adminKey = process.env["ADMIN_API_KEY"];
  const bearer = bearerToken(req);
  const admin = getAdminUser(adminKey, bearer);
  if (admin) return admin;

  const sessionUser = await getAuthenticatedUser(req);
  if (!sessionUser || !sessionUser.user.isAdmin) return null;
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

export function validateRedirectUrl(redirect?: string): string {
  const allowedHostsEnv = process.env["ALLOWED_REDIRECT_HOSTS"];
  const allowedHosts = allowedHostsEnv ? allowedHostsEnv.split(",").map(h => h.trim().toLowerCase()) : [];
  return validateRedirect(redirect, allowedHosts);
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

  if (!bearer && !cookieSessionId) {
    return { error: new Response(JSON.stringify({ error: "Missing bearer or session token" }), { status: 401 }) };
  }

  const stores = buildStores(opts?.redis);
  const token = bearer || cookieSessionId;
  
  if (!token) {
    return { error: new Response(JSON.stringify({ error: "Missing token" }), { status: 401 }) };
  }

  const grant = await validateToken(token, stores);
  if (grant) return { access: grant };

  return { error: new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 }) };
}
