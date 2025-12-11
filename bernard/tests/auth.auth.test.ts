import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import type { NextRequest } from "next/server";

import {
  bearerToken,
  buildSessionCookie,
  clearSessionCookie,
  getAuthenticatedUser,
  requireAdmin,
  validateAccessToken
} from "@/lib/auth/auth";
import { SessionStore } from "@/lib/auth/sessionStore";
import { TokenStore } from "@/lib/auth/tokenStore";
import { UserStore } from "@/lib/auth/userStore";
import { FakeRedis } from "./fakeRedis";

const TEST_TIMEOUT = 1_000;
const originalEnv = { ...process.env };

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

const makeRequest = (opts: { headers?: Record<string, string>; cookies?: Record<string, string> } = {}): NextRequest => {
  const cookies = opts.cookies ?? {};
  return {
    headers: new Headers(opts.headers),
    cookies: {
      get(name: string) {
        const value = cookies[name];
        return value === undefined ? undefined : { name, value };
      }
    }
  } as unknown as NextRequest;
};

const createStores = (redis: FakeRedis) => {
  const userStore = new UserStore(redis as any);
  const sessionStore = new SessionStore(redis as any);
  const tokenStore = new TokenStore(redis as any);
  return { userStore, sessionStore, tokenStore };
};

afterEach(() => {
  resetEnv();
  (global as any).redis = undefined;
});

test("bearerToken extracts bearer scheme and token", { timeout: TEST_TIMEOUT }, () => {
  const req = makeRequest({ headers: { authorization: "Bearer secret-token" } });
  assert.equal(bearerToken(req), "secret-token");
});

test("bearerToken returns null for missing or invalid authorization header", { timeout: TEST_TIMEOUT }, () => {
  assert.equal(bearerToken(makeRequest()), null);
  assert.equal(bearerToken(makeRequest({ headers: { authorization: "Basic abc" } })), null);
  assert.equal(bearerToken(makeRequest({ headers: { authorization: "Bearer" } })), null);
});

test("buildSessionCookie sets base attributes and secure only in production", { timeout: TEST_TIMEOUT }, () => {
  process.env["NODE_ENV"] = "development";
  const cookie = buildSessionCookie("sid-123", 3600);
  assert.match(cookie, /bernard_session=sid-123/);
  assert.match(cookie, /Max-Age=3600/);
  assert.ok(!cookie.includes("Secure"));

  process.env["NODE_ENV"] = "production";
  const secureCookie = buildSessionCookie("sid-123", 3600);
  assert.ok(secureCookie.includes("Secure"));
});

test("clearSessionCookie clears value and respects secure flag", { timeout: TEST_TIMEOUT }, () => {
  process.env["NODE_ENV"] = "development";
  const cookie = clearSessionCookie();
  assert.match(cookie, /bernard_session=/);
  assert.match(cookie, /Max-Age=0/);
  assert.ok(!cookie.includes("Secure"));

  process.env["NODE_ENV"] = "production";
  const secureCookie = clearSessionCookie();
  assert.ok(secureCookie.includes("Secure"));
});

test("getAuthenticatedUser returns null when no session cookie is present", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const result = await getAuthenticatedUser(makeRequest(), redis as any);
  assert.equal(result, null);
});

test("getAuthenticatedUser returns user when session and user are active", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "u1", displayName: "Active", isAdmin: false });
  const session = await sessionStore.create(user.id);

  const req = makeRequest({ cookies: { bernard_session: session.id } });
  const result = await getAuthenticatedUser(req, redis as any);

  assert.equal(result?.user.id, user.id);
  assert.equal(result?.sessionId, session.id);
});

test("getAuthenticatedUser deletes session when user record is missing", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { sessionStore } = createStores(redis);
  const session = await sessionStore.create("ghost-user");

  const req = makeRequest({ cookies: { bernard_session: session.id } });
  const result = await getAuthenticatedUser(req, redis as any);

  assert.equal(result, null);
  assert.equal(await sessionStore.get(session.id), null);
});

test("getAuthenticatedUser deletes session when user is disabled", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "u2", displayName: "Disabled", isAdmin: false });
  await userStore.setStatus(user.id, "disabled");
  const session = await sessionStore.create(user.id);

  const req = makeRequest({ cookies: { bernard_session: session.id } });
  const result = await getAuthenticatedUser(req, redis as any);

  assert.equal(result, null);
  assert.equal(await sessionStore.get(session.id), null);
});

test("getAuthenticatedUser deletes session when user is deleted", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "u2-del", displayName: "ToDelete", isAdmin: false });
  const session = await sessionStore.create(user.id);
  await userStore.delete(user.id);

  const req = makeRequest({ cookies: { bernard_session: session.id } });
  const result = await getAuthenticatedUser(req, redis as any);

  assert.equal(result, null);
  assert.equal(await sessionStore.get(session.id), null);
});

test("requireAdmin returns stub user when ADMIN_API_KEY bearer matches", { timeout: TEST_TIMEOUT }, async () => {
  process.env["ADMIN_API_KEY"] = "admin-key";
  const req = makeRequest({ headers: { authorization: "Bearer admin-key" } });
  const result = await requireAdmin(req);

  assert.ok(result);
  assert.equal(result?.user.isAdmin, true);
  assert.equal(result?.sessionId, null);
});

test("requireAdmin returns admin session user when available", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  (global as any).redis = redis as any;
  const { userStore, sessionStore } = createStores(redis);
  const adminUser = await userStore.create({ id: "admin", displayName: "Admin", isAdmin: true });
  const session = await sessionStore.create(adminUser.id);

  const req = makeRequest({ cookies: { bernard_session: session.id } });
  const result = await requireAdmin(req);

  assert.equal(result?.user.id, adminUser.id);
  assert.equal(result?.user.isAdmin, true);
});

test("requireAdmin rejects non-admin session user", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  (global as any).redis = redis as any;
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "user", displayName: "User", isAdmin: false });
  const session = await sessionStore.create(user.id);

  const req = makeRequest({ cookies: { bernard_session: session.id } });
  const result = await requireAdmin(req);

  assert.equal(result, null);
});

test("requireAdmin ignores incorrect bearer token when admin key is set", { timeout: TEST_TIMEOUT }, async () => {
  process.env["ADMIN_API_KEY"] = "admin-key";
  const redis = new FakeRedis();
  (global as any).redis = redis as any;

  const req = makeRequest({ headers: { authorization: "Bearer not-admin" } });
  const result = await requireAdmin(req);

  assert.equal(result, null);
});

test("validateAccessToken returns 401 when no credentials provided", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const req = makeRequest();
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("error" in result);
  assert.equal(result.error.status, 401);
  assert.equal((await result.error.json()).error, "Missing bearer or session token");
});

test("validateAccessToken accepts valid API bearer token", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { tokenStore } = createStores(redis);
  const record = await tokenStore.create("token-one");

  const req = makeRequest({ headers: { authorization: `Bearer ${record.token}` } });
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("access" in result);
  assert.equal(result.access.source, "api-token");
  assert.equal(result.access.token, record.token);
});

test("validateAccessToken accepts session bearer token", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "u3", displayName: "User", isAdmin: false });
  const session = await sessionStore.create(user.id);

  const req = makeRequest({ headers: { authorization: `Bearer ${session.id}` } });
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("access" in result);
  assert.equal(result.access.source, "session");
  assert.equal(result.access.user?.id, user.id);
});

test("validateAccessToken accepts session cookie when no bearer is present", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "u4", displayName: "User", isAdmin: false });
  const session = await sessionStore.create(user.id);

  const req = makeRequest({ cookies: { bernard_session: session.id } });
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("access" in result);
  assert.equal(result.access.source, "session");
  assert.equal(result.access.user?.id, user.id);
});

test("validateAccessToken returns 401 when session cookie is unknown", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const req = makeRequest({ cookies: { bernard_session: "ghost-session" } });
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("error" in result);
  assert.equal(result.error.status, 401);
  assert.equal((await result.error.json()).error, "Missing bearer or session token");
});

test("validateAccessToken returns 401 for invalid bearer token", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const req = makeRequest({ headers: { authorization: "Bearer unknown" } });
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("error" in result);
  assert.equal(result.error.status, 401);
  assert.equal((await result.error.json()).error, "Invalid token");
});

test("validateAccessToken deletes disabled user sessions", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "u5", displayName: "User", isAdmin: false });
  await userStore.setStatus(user.id, "disabled");
  const session = await sessionStore.create(user.id);

  const req = makeRequest({ headers: { authorization: `Bearer ${session.id}` } });
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("error" in result);
  assert.equal(result.error.status, 401);
  assert.equal((await result.error.json()).error, "Invalid token");
  assert.equal(await sessionStore.get(session.id), null);
});

test("validateAccessToken rejects invalid bearer even when session cookie is valid", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const { userStore, sessionStore } = createStores(redis);
  const user = await userStore.create({ id: "u6", displayName: "User", isAdmin: false });
  const session = await sessionStore.create(user.id);

  const req = makeRequest({ headers: { authorization: "Bearer bad-token" }, cookies: { bernard_session: session.id } });
  const result = await validateAccessToken(req, { redis: redis as any });

  assert.ok("error" in result);
  assert.equal(result.error.status, 401);
  assert.equal((await result.error.json()).error, "Invalid token");
  assert.notEqual(await sessionStore.get(session.id), null);
});
