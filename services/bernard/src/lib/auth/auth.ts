import type Redis from "ioredis";
import { 
  buildStores as buildSharedStores,
  resolveSession as resolveSharedSession,
  getAdminUser,
  validateToken,
} from "@shared/auth/index";
import type { 
  AuthenticatedUser,
  AccessGrant
} from "@shared/auth/index";
import { getRedis } from "@/lib/infra/redis";
import { logger } from "@/lib/logging";

export type { AuthenticatedUser, AccessGrant };

/**
 * Extract the bearer token from an Authorization header string.
 */
export function bearerToken(authorization?: string) {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export const buildStores = (redis?: Redis) => buildSharedStores(redis ?? getRedis());

/**
 * Resolve an authenticated user from a session ID or Authorization header.
 */
export async function getAuthenticatedUser(sessionIdOrAuth: string, redis?: Redis): Promise<AuthenticatedUser | null> {
  const bearer = bearerToken(sessionIdOrAuth);
  const sessionId = bearer || sessionIdOrAuth;

  if (!sessionId) {
    // Check if this is an admin request with ADMIN_API_KEY
    const admin = getAdminUser(process.env["ADMIN_API_KEY"], sessionIdOrAuth);
    if (admin) {
      logger.info({ event: 'auth.admin_key.detected' }, '✅ Auth: Admin API key detected');
      return admin;
    }
    return null;
  }
  
  const stores = buildStores(redis);
  const result = await resolveSharedSession(sessionId, stores);
  if (result) return result;

  return null;
}

/**
 * Validate access using an API bearer token or session cookie.
 */
export async function validateAccessToken(
  token: string,
  opts?: { redis?: Redis }
): Promise<{ access: AccessGrant } | { error: { message: string, status: number } }> {
  const stores = buildStores(opts?.redis);
  
  if (!token) {
    return { error: { message: "Missing token", status: 401 } };
  }

  const grant = await validateToken(token, stores);
  if (grant) return { access: grant };

  return { error: { message: "Invalid token", status: 401 } };
}

/**
 * Build a session cookie string
 */
export function buildSessionCookie(sessionId: string, maxAge: number): string {
  const isProduction = process.env["NODE_ENV"] === "production";
  const secure = isProduction ? "; Secure" : "";
  const sameSite = isProduction ? "; SameSite=Lax" : "; SameSite=Lax";

  return `bernard_session=${sessionId}; Max-Age=${maxAge}; Path=/; HttpOnly${secure}${sameSite}`;
}

/**
 * Build a cookie string that clears the session
 */
export function clearSessionCookie(): string {
  const isProduction = process.env["NODE_ENV"] === "production";
  const secure = isProduction ? "; Secure" : "";
  const sameSite = isProduction ? "; SameSite=Lax" : "; SameSite=Lax";

  return `bernard_session=; Max-Age=0; Path=/; HttpOnly${secure}${sameSite}`;
}
