import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, beforeEach, test } from "vitest";

import { NextRequest } from "next/server";

import { handleOAuthCallback, startOAuthLogin, getProviderConfig } from "../lib/auth/oauth";
import { clearSettingsCache } from "../lib/config/settingsCache";
import { getRedis } from "../lib/infra/redis";
import { FakeRedis } from "./fakeRedis";

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

const TEST_TIMEOUT = 2_000;

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalConsole = { ...console };

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

const mockFetchSequence = (responses: Array<Response | Error>) => {
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
};

const base64UrlEncode = (buffer: Buffer) =>
  buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const codeChallengeFromVerifier = (verifier: string) =>
  base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());

beforeEach(() => {
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
  (globalThis as any).redis = new FakeRedis();
  clearSettingsCache();
});

afterEach(() => {
  resetEnv();
  globalThis.fetch = originalFetch;
  Object.assign(console, originalConsole);
  (globalThis as any).redis = undefined;
  clearSettingsCache();
});

const seedSettingsOauth = async (config: Record<"default" | "google" | "github", unknown>) => {
  const redis = getRedis() as any;
  await redis.set(
    "bernard:settings:oauth",
    JSON.stringify({
      default: config.default,
      google: config.google,
      github: config.github
    })
  );
  clearSettingsCache();
};

test("getProviderConfig prefers settings over env", { timeout: TEST_TIMEOUT }, async () => {
  const oauthConfig = {
    authUrl: "https://settings.example.com/auth",
    tokenUrl: "https://settings.example.com/token",
    userInfoUrl: "https://settings.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid email",
    clientId: "settings-client",
    clientSecret: "settings-secret"
  };
  await seedSettingsOauth({
    default: oauthConfig,
    google: oauthConfig,
    github: oauthConfig
  });

  const config = await getProviderConfig("google");
  assert.equal(config.authUrl, oauthConfig.authUrl);
  assert.equal(config.clientId, oauthConfig.clientId);
});

test("getProviderConfig falls back to env and throws when incomplete", { timeout: TEST_TIMEOUT }, async () => {
  process.env["OAUTH_GITHUB_AUTH_URL"] = "https://env.example.com/auth";
  process.env["OAUTH_GITHUB_TOKEN_URL"] = "https://env.example.com/token";
  process.env["OAUTH_GITHUB_USERINFO_URL"] = "https://env.example.com/user";
  process.env["OAUTH_GITHUB_REDIRECT_URI"] = "https://env.example.com/callback";
  process.env["OAUTH_GITHUB_SCOPES"] = "read:user";
  process.env["OAUTH_GITHUB_CLIENT_ID"] = "env-client";

  const config = await getProviderConfig("github");
  assert.equal(config.authUrl, "https://env.example.com/auth");

  resetEnv();
  await assert.rejects(() => getProviderConfig("default"), /OAuth is not configured/);
});

test("startOAuthLogin stores PKCE state and redirects with challenge", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    userInfoUrl: "https://auth.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    clientId: "client-123"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });

  const req = new NextRequest(new Request("https://app.example.com/login?redirect=/next"));
  const res = await startOAuthLogin("default", req);

  assert.equal(res.status, 302);
  const location = res.headers.get("Location");
  assert.ok(location);
  const url = new URL(location!);
  const state = url.searchParams.get("state");
  const challenge = url.searchParams.get("code_challenge");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), config.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("scope"), config.scope);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(state);
  assert.ok(challenge);

  const redis = getRedis() as any;
  const storedRaw = await redis.get(`bernard:oauth:state:default:${state}`);
  assert.ok(storedRaw);
  const stored = JSON.parse(storedRaw!) as { codeVerifier: string; returnTo: string };
  assert.equal(stored.returnTo, "/next");
  assert.equal(challenge, codeChallengeFromVerifier(stored.codeVerifier));
});

test("handleOAuthCallback succeeds with JSON token responses", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    userInfoUrl: "https://auth.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    clientId: "client-123"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });

  const redis = getRedis() as any;
  const state = "state-abc";
  const codeVerifier = "verifier-123";
  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier, returnTo: "/home" })
  );

  mockFetchSequence([
    new Response(JSON.stringify({ access_token: "token-xyz" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response(JSON.stringify({ sub: "user-1", name: "User One" }), {
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const req = new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`));
  const res = await handleOAuthCallback("default", req);

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "/home");
  const cookie = res.headers.get("Set-Cookie");
  assert.ok(cookie);
  assert.match(cookie!, /bernard_session=/);
  const storedState = await redis.get(`bernard:oauth:state:default:${state}`);
  assert.equal(storedState, null);
});

test("handleOAuthCallback uses GitHub-specific headers for token and userinfo", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://github.example.com/authorize",
    tokenUrl: "https://github.example.com/token",
    userInfoUrl: "https://github.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "read:user",
    clientId: "gh-client"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });

  const redis = getRedis() as any;
  const state = "state-github";
  await redis.set(
    `bernard:oauth:state:github:${state}`,
    JSON.stringify({ codeVerifier: "gh-verifier", returnTo: "/github" })
  );

  const calls = mockFetchSequence([
    new Response(JSON.stringify({ access_token: "gh-token" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response(JSON.stringify({ id: "gh-user", login: "octocat" }), {
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const req = new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`));
  const res = await handleOAuthCallback("github", req);

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), "/github");
  const [tokenCall, userCall] = calls;
  assert.ok(tokenCall);
  const tokenHeaders = tokenCall.init?.headers as Headers | Record<string, string> | undefined;
  const tokenAccept =
    tokenHeaders instanceof Headers ? tokenHeaders.get("Accept") : tokenHeaders ? tokenHeaders["Accept"] : undefined;
  assert.equal(tokenAccept, "application/json");

  assert.ok(userCall);
  const userHeaders = userCall.init?.headers as Headers | Record<string, string> | undefined;
  const userAccept =
    userHeaders instanceof Headers ? userHeaders.get("Accept") : userHeaders ? userHeaders["Accept"] : undefined;
  const userAgent =
    userHeaders instanceof Headers ? userHeaders.get("User-Agent") : userHeaders ? userHeaders["User-Agent"] : undefined;
  assert.equal(userAccept, "application/vnd.github+json");
  assert.equal(userAgent, "bernard-admin");
});

test("handleOAuthCallback supports form-encoded token responses", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    userInfoUrl: "https://auth.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    clientId: "client-123"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });

  const redis = getRedis() as any;
  const state = "state-form";
  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier: "v-form", returnTo: "/" })
  );

  mockFetchSequence([
    new Response("access_token=form-token", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }),
    new Response(JSON.stringify({ sub: "user-2", name: "User Two" }), {
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const req = new NextRequest(new Request(`https://app.example.com/callback?code=zzz&state=${state}`));
  const res = await handleOAuthCallback("default", req);

  assert.equal(res.status, 302);
  assert.match(res.headers.get("Set-Cookie") ?? "", /bernard_session=/);
});

test("handleOAuthCallback returns 400 when missing code or state", { timeout: TEST_TIMEOUT }, async () => {
  const res = await handleOAuthCallback("default", new NextRequest(new Request("https://app.example.com/callback")));
  assert.equal(res.status, 400);
});

test("handleOAuthCallback returns 400 for unknown or invalid state", { timeout: TEST_TIMEOUT }, async () => {
  const redis = getRedis() as any;
  await redis.set("bernard:oauth:state:default:bad", "not-json");

  const res = await handleOAuthCallback(
    "default",
    new NextRequest(new Request("https://app.example.com/callback?code=abc&state=bad"))
  );
  assert.equal(res.status, 400);
});

test("handleOAuthCallback surfaces token exchange failures", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    userInfoUrl: "https://auth.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    clientId: "client-123"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });
  const redis = getRedis() as any;
  const state = "state-fail";
  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier: "v-fail", returnTo: "/" })
  );

  mockFetchSequence([new Response("fail", { status: 500 })]);

  const res = await handleOAuthCallback(
    "default",
    new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`))
  );
  assert.equal(res.status, 500);
  assert.match(res.headers.get("Set-Cookie") ?? "", /bernard_session=; Path=\/; Max-Age=0/);
});

test("handleOAuthCallback rejects missing access token", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    userInfoUrl: "https://auth.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    clientId: "client-123"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });
  const redis = getRedis() as any;
  const state = "state-no-token";
  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier: "v-missing", returnTo: "/" })
  );

  mockFetchSequence([new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } })]);

  const res = await handleOAuthCallback(
    "default",
    new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`))
  );
  assert.equal(res.status, 400);
});

test("handleOAuthCallback rejects userinfo errors and missing subject", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    userInfoUrl: "https://auth.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    clientId: "client-123"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });
  const redis = getRedis() as any;
  const state = "state-userinfo";
  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier: "v-info", returnTo: "/" })
  );

  mockFetchSequence([
    new Response(JSON.stringify({ access_token: "token" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response("nope", { status: 500 })
  ]);

  const resError = await handleOAuthCallback(
    "default",
    new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`))
  );
  assert.equal(resError.status, 500);

  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier: "v-info", returnTo: "/" })
  );
  mockFetchSequence([
    new Response(JSON.stringify({ access_token: "token" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response(JSON.stringify({ name: "No Subject" }), { headers: { "Content-Type": "application/json" } })
  ]);

  const resMissing = await handleOAuthCallback(
    "default",
    new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`))
  );
  assert.equal(resMissing.status, 500);
});

test("handleOAuthCallback blocks disabled or deleted users", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    userInfoUrl: "https://auth.example.com/user",
    redirectUri: "https://app.example.com/callback",
    scope: "openid profile",
    clientId: "client-123"
  };
  await seedSettingsOauth({ default: config, google: config, github: config });

  const redis = getRedis() as any;
  const state = "state-disabled";
  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier: "v-disabled", returnTo: "/" })
  );
  await redis.hset("bernard:users:id:user-disabled", {
    id: "user-disabled",
    displayName: "Disabled",
    isAdmin: "false",
    status: "disabled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await redis.sadd("bernard:users:ids", "user-disabled");

  mockFetchSequence([
    new Response(JSON.stringify({ access_token: "token" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response(JSON.stringify({ sub: "user-disabled", name: "Disabled" }), {
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const resDisabled = await handleOAuthCallback(
    "default",
    new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`))
  );
  assert.equal(resDisabled.status, 403);
  assert.match(resDisabled.headers.get("Set-Cookie") ?? "", /bernard_session=; Path=\/; Max-Age=0/);

  await redis.set(
    `bernard:oauth:state:default:${state}`,
    JSON.stringify({ codeVerifier: "v-deleted", returnTo: "/" })
  );
  await redis.hset("bernard:users:id:user-deleted", {
    id: "user-deleted",
    displayName: "Deleted",
    isAdmin: "false",
    status: "deleted",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await redis.sadd("bernard:users:ids", "user-deleted");

  // Force UserStore to see deleted status and throw
  mockFetchSequence([
    new Response(JSON.stringify({ access_token: "token" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response(JSON.stringify({ sub: "user-deleted", name: "Deleted" }), {
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const resDeleted = await handleOAuthCallback(
    "default",
    new NextRequest(new Request(`https://app.example.com/callback?code=abc&state=${state}`))
  );
  assert.equal(resDeleted.status, 403);
});

