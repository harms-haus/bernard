import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

import { NextRequest } from "next/server";
import type Redis from "ioredis";

import { clearSettingsCache } from "../lib/config/settingsCache";
import { getRedis } from "../lib/infra/redis";
import { FakeRedis } from "./fakeRedis";

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
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
};

const seedSettingsOauth = async (config: Record<string, unknown>) => {
  const redis = getRedis() as Redis;
  await redis.set(
    "bernard:settings:oauth",
    JSON.stringify({
      default: config,
      google: config,
      github: config
    })
  );
  clearSettingsCache();
};

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

test("Google OAuth endpoint redirects to Google with correct parameters", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    redirectUri: "http://localhost:3000/api/auth/google/callback",
    scope: "openid profile email",
    clientId: "google-client-id",
    clientSecret: "google-client-secret"
  };
  await seedSettingsOauth(config);

  // Import the Google OAuth endpoint
  const googleModule = await import("../app/api/auth/google/login/route");
  const response = await googleModule.GET(
    new NextRequest(new Request("http://localhost:3000/api/auth/google/login?redirect=/dashboard"))
  );

  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.ok(location);
  
  const url = new URL(location!);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), config.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), config.scope);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  
  // Check that state contains redirect information
  const state = url.searchParams.get("state");
  assert.ok(state);
  const stateData = JSON.parse(Buffer.from(state, "base64").toString());
  assert.equal(stateData.redirect, "/dashboard");
});

test("GitHub OAuth endpoint redirects to GitHub with correct parameters", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    redirectUri: "http://localhost:3456/bernard/api/auth/github/callback",
    scope: "read:user user:email",
    clientId: "github-client-id",
    clientSecret: "github-client-secret"
  };
  await seedSettingsOauth(config);

  // Import the GitHub OAuth endpoint
  const githubModule = await import("../app/api/auth/github/login/route");
  const response = await githubModule.GET(
    new NextRequest(new Request("http://localhost:3000/api/auth/github/login?redirect=/settings"))
  );

  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.ok(location);
  
  const url = new URL(location!);
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), config.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("scope"), config.scope);
  
  // Check that state contains redirect information
  const state = url.searchParams.get("state");
  assert.ok(state);
  const stateData = JSON.parse(Buffer.from(state, "base64").toString());
  assert.equal(stateData.redirect, "/settings");
});

test("Google OAuth callback handles successful authentication", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    redirectUri: "http://localhost:3000/api/auth/google/callback",
    scope: "openid profile email",
    clientId: "google-client-id",
    clientSecret: "google-client-secret"
  };
  await seedSettingsOauth(config);

  // Mock the fetch calls for token exchange and user info
  const fetchCalls = mockFetchSequence([
    new Response(JSON.stringify({ access_token: "google-token-123" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response(JSON.stringify({
      id: "123456789",
      email: "test@example.com",
      name: "Test User",
      given_name: "Test"
    }), {
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const state = Buffer.from(JSON.stringify({ redirect: "/dashboard" })).toString("base64");
  
  // Import the Google OAuth callback endpoint
  const googleCallbackModule = await import("../app/api/auth/google/callback/route");
  const response = await googleCallbackModule.GET(
    new NextRequest(new Request(`http://localhost:3000/api/auth/google/callback?code=auth-code-123&state=${state}`))
  );

  console.log("Google callback response status:", response.status);
  console.log("Google callback response location:", response.headers.get("Location"));
  console.log("Google callback response cookie:", response.headers.get("Set-Cookie"));
  console.log("Fetch calls made:", fetchCalls.length);

  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.equal(location, "/dashboard");
  
  // Check that session cookie is set
  const cookie = response.headers.get("Set-Cookie");
  assert.ok(cookie);
  assert.match(cookie!, /bernard_session=/);
});

test("GitHub OAuth callback handles successful authentication", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    redirectUri: "http://localhost:3456/bernard/api/auth/github/callback",
    scope: "read:user user:email",
    clientId: "github-client-id",
    clientSecret: "github-client-secret"
  };
  await seedSettingsOauth(config);

  // Set up CSRF token for GitHub callback validation
  const redis = getRedis() as Redis;
  const csrfToken = "test-csrf-token-456";
  await redis.setex(`csrf:${csrfToken}`, 600, csrfToken);

  // Mock the fetch calls for token exchange and user info
  mockFetchSequence([
    new Response(JSON.stringify({ access_token: "github-token-456" }), {
      headers: { "Content-Type": "application/json" }
    }),
    new Response(JSON.stringify({
      id: "987654321",
      login: "testuser",
      name: "Test GitHub User",
      email: "test@github.com"
    }), {
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const state = Buffer.from(JSON.stringify({ redirect: "/profile", csrf: csrfToken })).toString("base64");
  
  // Import the GitHub OAuth callback endpoint
  const githubCallbackModule = await import("../app/api/auth/github/callback/route");
  const response = await githubCallbackModule.GET(
    new NextRequest(new Request(`http://localhost:3456/bernard/api/auth/github/callback?code=gh-auth-code&state=${state}`))
  );

  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.equal(location, "/profile");
  
  // Check that session cookie is set
  const cookie = response.headers.get("Set-Cookie");
  assert.ok(cookie);
  assert.match(cookie!, /bernard_session=/);
});

test("Google OAuth callback handles missing code parameter", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    redirectUri: "http://localhost:3456/bernard/api/auth/google/callback",
    scope: "openid profile email",
    clientId: "google-client-id",
    clientSecret: "google-client-secret"
  };
  await seedSettingsOauth(config);

  // Import the Google OAuth callback endpoint
  const googleCallbackModule = await import("../app/api/auth/google/callback/route");
  const response = await googleCallbackModule.GET(
    new NextRequest(new Request("http://localhost:3456/bernard/api/auth/google/callback"))
  );

  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.equal(location, "/login?error=no_code");
});

test("GitHub OAuth callback handles token exchange failure", { timeout: TEST_TIMEOUT }, async () => {
  const config = {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    redirectUri: "http://localhost:3  456/bernard/api/auth/github/callback",
    scope: "read:user user:email",
    clientId: "github-client-id",
    clientSecret: "github-client-secret"
  };
  await seedSettingsOauth(config);

  // Set up CSRF token for GitHub callback validation
  const redis = getRedis() as Redis;
  const csrfToken = "test-csrf-token-failure";
  await redis.setex(`csrf:${csrfToken}`, 600, csrfToken);

  // Mock a failed token exchange
  mockFetchSequence([
    new Response(JSON.stringify({ error: "invalid_code" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  ]);

  const state = Buffer.from(JSON.stringify({ redirect: "/profile", csrf: csrfToken })).toString("base64");

  // Import the GitHub OAuth callback endpoint
  const githubCallbackModule = await import("../app/api/auth/github/callback/route");
  const response = await githubCallbackModule.GET(
    new NextRequest(new Request(`http://localhost:3456/bernard/api/auth/github/callback?code=invalid-code&state=${state}`))
  );

  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.equal(location, "/login?error=token_exchange_failed");
});

test("validateRedirectUrl validates redirects correctly", async () => {
  const { validateRedirectUrl } = await import("../lib/auth/auth");

  // Test relative paths (should be allowed)
  assert.equal(validateRedirectUrl("/dashboard"), "/dashboard");
  assert.equal(validateRedirectUrl("/settings/profile"), "/settings/profile");
  assert.equal(validateRedirectUrl("/"), "/");

  // Test protocol-relative URLs (should be rejected)
  assert.equal(validateRedirectUrl("//evil.com"), "/");

  // Test absolute URLs with allowed hosts (when ALLOWED_REDIRECT_HOSTS is set)
  process.env["ALLOWED_REDIRECT_HOSTS"] = "example.com,trusted.org";
  assert.equal(validateRedirectUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(validateRedirectUrl("http://example.com/path"), "http://example.com/path");
  assert.equal(validateRedirectUrl("https://trusted.org/page"), "https://trusted.org/page");

  // Test absolute URLs with disallowed hosts (should be rejected)
  assert.equal(validateRedirectUrl("https://evil.com/path"), "/");
  assert.equal(validateRedirectUrl("https://sub.evil.com/path"), "/");

  // Test invalid protocols (should be rejected)
  assert.equal(validateRedirectUrl("ftp://example.com/path"), "/");
  assert.equal(validateRedirectUrl("javascript:alert('xss')"), "/");

  // Test control characters (should be rejected)
  assert.equal(validateRedirectUrl("/dashboard\n"), "/");
  assert.equal(validateRedirectUrl("https://example.com/\x00"), "/");

  // Test invalid URLs (should be rejected)
  assert.equal(validateRedirectUrl("not-a-url"), "/");
  assert.equal(validateRedirectUrl(""), "/");
  assert.equal(validateRedirectUrl(null), "/");
  assert.equal(validateRedirectUrl(undefined), "/");

  // Test case-insensitive host matching
  assert.equal(validateRedirectUrl("https://EXAMPLE.COM/path"), "https://EXAMPLE.COM/path");
  assert.equal(validateRedirectUrl("https://Trusted.Org/page"), "https://Trusted.Org/page");

  // Clean up
  delete process.env["ALLOWED_REDIRECT_HOSTS"];
});