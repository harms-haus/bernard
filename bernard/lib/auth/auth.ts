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

export async function getAuthenticatedUser(req: NextRequest, redis?: Redis): Promise<AuthenticatedUser | null> {
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;
  const stores = buildStores(redis);
  return resolveSession(sessionCookie, stores);
}

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

export function clearSessionCookie() {
  const secure = process.env["NODE_ENV"] === "production";
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

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

