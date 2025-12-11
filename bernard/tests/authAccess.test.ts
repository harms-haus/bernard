import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { validateAccessToken } from "../lib/auth";
import { TokenStore } from "../lib/tokenStore";
import { SessionStore } from "../lib/sessionStore";
import { UserStore } from "../lib/userStore";
import { FakeRedis } from "./fakeRedis";

const makeRequest = (headers: Record<string, string> = {}, cookies?: Record<string, string>) => {
  const cookieHeader =
    cookies && Object.keys(cookies).length
      ? {
          cookie: Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join("; ")
        }
      : {};
  const req = new Request("http://localhost/api/test", {
    headers: { ...headers, ...cookieHeader }
  });
  return new NextRequest(req);
};

test("validateAccessToken accepts API tokens", async () => {
  const redis = new FakeRedis() as any;
  const tokens = new TokenStore(redis);
  const record = await tokens.create("alpha");

  const req = makeRequest({ Authorization: `Bearer ${record.token}` });
  const result = await validateAccessToken(req, { redis });

  assert.ok("access" in result);
  assert.equal(result.access.token, record.token);
  assert.equal(result.access.source, "api-token");
});

test("validateAccessToken accepts session tokens via bearer and cookies", async () => {
  const redis = new FakeRedis() as any;
  const sessionStore = new SessionStore(redis);
  const userStore = new UserStore(redis);

  await userStore.create({ id: "user-1", displayName: "User One", isAdmin: true });
  const session = await sessionStore.create("user-1");

  const bearerRequest = makeRequest({ Authorization: `Bearer ${session.id}` });
  const bearerResult = await validateAccessToken(bearerRequest, { redis });
  assert.ok("access" in bearerResult);
  assert.equal(bearerResult.access.source, "session");
  assert.equal(bearerResult.access.token, session.id);
  assert.equal(bearerResult.access.user?.id, "user-1");

  const cookieRequest = makeRequest({}, { bernard_session: session.id });
  const cookieResult = await validateAccessToken(cookieRequest, { redis });
  assert.ok("access" in cookieResult);
  assert.equal(cookieResult.access.source, "session");
  assert.equal(cookieResult.access.token, session.id);
});


