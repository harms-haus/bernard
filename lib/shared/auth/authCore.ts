import type { Redis } from "ioredis";
import { UserRecord, AuthenticatedUser, AccessGrant } from "./types";
import { SessionStore } from "./sessionStore";
import { UserStore } from "./userStore";
import { TokenStore } from "./tokenStore";

export type AuthStores = {
  redis: Redis;
  sessionStore: SessionStore;
  userStore: UserStore;
  tokenStore: TokenStore;
};

export const buildStores = (redis: Redis): AuthStores => {
  return {
    redis,
    sessionStore: new SessionStore(redis),
    userStore: new UserStore(redis),
    tokenStore: new TokenStore(redis)
  };
};

export const resolveSession = async (
  sessionId: string,
  stores: AuthStores
): Promise<AuthenticatedUser | null> => {
  const session = await stores.sessionStore.get(sessionId);
  if (!session) return null;

  const user = await stores.userStore.get(session.userId);
  if (!user || user.status !== "active") {
    if (user && user.status !== "active") {
      await stores.sessionStore.delete(sessionId, session.userId);
    }
    return null;
  }

  return { user, sessionId: session.id };
};

export const getAdminUser = (adminKey: string | undefined, bearerToken: string | null): AuthenticatedUser | null => {
  if (!adminKey || !bearerToken || bearerToken !== adminKey) return null;
  
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
};

export async function validateToken(
  token: string,
  stores: AuthStores
): Promise<AccessGrant | null> {
  // 1. Check for Static API Token
  const staticToken = await stores.tokenStore.validate(token);
  if (staticToken) {
    return { token, source: "api-token" };
  }

  // 2. Check for Session
  const session = await resolveSession(token, stores);
  if (session) {
    return { token, source: "session", user: session.user };
  }

  return null;
}

export function validateRedirect(redirect: string | undefined, allowedHosts: string[] = []): string {
  if (!redirect || typeof redirect !== "string") return "/";
  if (/[\x00-\x1F\x7F]/.test(redirect)) return "/";
  if (redirect.startsWith("/")) {
    if (redirect.startsWith("//")) return "/";
    return redirect;
  }
  try {
    const url = new URL(redirect);
    if (!["http:", "https:"].includes(url.protocol)) return "/";
    const redirectHost = url.hostname.toLowerCase();
    if (!allowedHosts.includes(redirectHost)) return "/";
    return redirect;
  } catch {
    return "/";
  }
}

