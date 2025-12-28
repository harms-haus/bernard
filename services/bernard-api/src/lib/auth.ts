import type { FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { 
  buildStores as buildSharedStores,
  resolveSession as resolveSharedSession,
  getAdminUser,
  validateToken,
  type AuthenticatedUser,
  type AccessGrant
} from "@shared/auth/index";
import { getRedis } from "@shared/infra/redis";
import { logger } from "./logger";

export type { AuthenticatedUser, AccessGrant };

const SESSION_COOKIE = "bernard_session";

/**
 * Extract the bearer token from an Authorization header.
 * Returns null when the header is absent, not bearer, or missing a token value.
 */
export function bearerToken(req: FastifyRequest) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export const buildStores = (redis?: Redis) => buildSharedStores(redis ?? getRedis());

/**
 * Resolve an authenticated user from the session cookie or Authorization header.
 * Accepts an optional Redis client to aid testing or dependency injection.
 */
export async function getAuthenticatedUser(req: FastifyRequest, redis?: Redis): Promise<AuthenticatedUser | null> {
  const sessionCookie = req.cookies?.bernard_session;
  const bearer = bearerToken(req);

  if (!sessionCookie && !bearer) return null;

  const stores = buildStores(redis);

  // 1. Check for Admin API Key
  if (bearer) {
    const admin = getAdminUser(process.env["ADMIN_API_KEY"], bearer);
    if (admin) {
      logger.info({ event: 'auth.admin_key.detected' }, '✅ Auth: Admin API key detected');
      return admin;
    }
  }

  // 2. Check for Static API Token / Session
  const sessionId = bearer || sessionCookie;
  if (sessionId) {
    const grant = await validateToken(sessionId, stores);
    if (grant && grant.source === "api-token") {
      logger.info({ event: 'auth.static_token.detected' }, '✅ Auth: Static API token detected');
      return {
        user: {
          id: `token:${grant.token}`,
          displayName: `API Token`,
          isAdmin: false,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        sessionId: null
      };
    }
    
    const result = await resolveSharedSession(sessionId, stores);
    if (result) {
      logger.debug({ event: 'auth.session.detected', source: bearer ? 'bearer' : 'cookie' }, '✅ Auth: Session detected');
      return result;
    }
  }

  return null;
}

/**
 * Require an admin user either via ADMIN_API_KEY bearer token or an admin session cookie.
 * Returns the authenticated admin user or null when not authorized.
 */
export async function requireAdmin(req: FastifyRequest): Promise<AuthenticatedUser | null> {
  const adminKey = process.env["ADMIN_API_KEY"];
  const bearer = bearerToken(req);
  const admin = getAdminUser(adminKey, bearer);
  if (admin) return admin;

  const authUser = await getAuthenticatedUser(req);
  if (authUser && authUser.user.isAdmin) return authUser;

  return null;
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
 * Validate access using an API bearer token or session cookie.
 * Returns an AccessGrant on success or a 401 Response on failure.
 */
export async function validateAccessToken(
  req: FastifyRequest,
  opts?: { redis?: Redis }
): Promise<{ access: AccessGrant } | { error: Response }> {
  const bearer = bearerToken(req);
  const sessionCookie = req.cookies?.[SESSION_COOKIE];

  if (!bearer && !sessionCookie) {
    return { error: new Response(JSON.stringify({ error: "Missing bearer or session token" }), { status: 401 }) };
  }

  const stores = buildStores(opts?.redis);
  const token = bearer || sessionCookie;
  
  if (!token) {
    return { error: new Response(JSON.stringify({ error: "Missing token" }), { status: 401 }) };
  }

  const grant = await validateToken(token, stores);
  if (grant) return { access: grant };

  return { error: new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 }) };
}

