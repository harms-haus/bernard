import type { NextRequest } from "next/server";

import { SessionStore } from "@/lib/sessionStore";
import { UserStore, type UserRecord } from "@/lib/userStore";
import { getRedis } from "@/lib/redis";

export type AuthenticatedUser = {
  user: UserRecord;
  sessionId: string | null;
};

const SESSION_COOKIE = "bernard_session";

const isAdminBearer = (req: NextRequest) => {
  const adminKey = process.env["ADMIN_API_KEY"];
  if (!adminKey) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === adminKey;
};

export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;
  const redis = getRedis();
  const sessionStore = new SessionStore(redis);
  const userStore = new UserStore(redis);

  const session = await sessionStore.get(sessionCookie);
  if (!session) return null;

  const user = await userStore.get(session.userId);
  if (!user) {
    await sessionStore.delete(sessionCookie, session.userId);
    return null;
  }

  if (user.status !== "active") {
    await sessionStore.delete(sessionCookie, session.userId);
    return null;
  }

  return { user, sessionId: session.id };
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

