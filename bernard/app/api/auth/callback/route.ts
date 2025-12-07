import type { NextRequest } from "next/server";

import { buildSessionCookie, clearSessionCookie } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { SessionStore } from "@/lib/sessionStore";
import { UserStore } from "@/lib/userStore";

export const runtime = "nodejs";

const STATE_NAMESPACE = "bernard:oauth:state";

type OAuthState = { codeVerifier: string; returnTo: string };

const requiredEnv = () => {
  const tokenUrl = process.env["OAUTH_TOKEN_URL"];
  const clientId = process.env["OAUTH_CLIENT_ID"];
  const clientSecret = process.env["OAUTH_CLIENT_SECRET"];
  const redirectUri = process.env["OAUTH_REDIRECT_URI"];
  const userInfoUrl = process.env["OAUTH_USERINFO_URL"];
  if (!tokenUrl || !clientId || !redirectUri || !userInfoUrl) {
    throw new Error("OAuth is not configured");
  }
  return { tokenUrl, clientId, clientSecret, redirectUri, userInfoUrl };
};

const parseState = async (state: string): Promise<OAuthState | null> => {
  const redis = getRedis();
  const raw = await redis.get(`${STATE_NAMESPACE}:${state}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthState;
  } catch (err) {
    console.error("Failed to parse OAuth state", err);
    return null;
  }
};

const deleteState = async (state: string) => {
  const redis = getRedis();
  await redis.del(`${STATE_NAMESPACE}:${state}`);
};

const exchangeCode = async (opts: {
  code: string;
  codeVerifier: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}) => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: opts.codeVerifier,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri
  });
  if (opts.clientSecret) {
    body.set("client_secret", opts.clientSecret);
  }
  const resp = await fetch(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${detail}`);
  }
  return (await resp.json()) as { access_token?: string };
};

const fetchUserInfo = async (userInfoUrl: string, accessToken: string) => {
  const resp = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Userinfo failed (${resp.status}): ${detail}`);
  }
  const data = (await resp.json()) as Record<string, string>;
  const id = data["sub"] ?? data["id"];
  if (!id) {
    throw new Error("Userinfo response missing subject");
  }
  const displayName = data["name"] ?? data["preferred_username"] ?? data["email"] ?? id;
  return { id, displayName };
};

const redirectWithCookie = (location: string, cookie?: string) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...(cookie ? { "Set-Cookie": cookie } : {})
    }
  });

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response(JSON.stringify({ error: "Missing code or state" }), { status: 400 });
  }

  try {
    const storedState = await parseState(state);
    if (!storedState) {
      return new Response(JSON.stringify({ error: "Unknown or expired state" }), { status: 400 });
    }
    await deleteState(state);

    const { tokenUrl, clientId, clientSecret, redirectUri, userInfoUrl } = requiredEnv();
    const token = await exchangeCode({
      code,
      codeVerifier: storedState.codeVerifier,
      tokenUrl,
      clientId,
      clientSecret,
      redirectUri
    });
    if (!token.access_token) {
      return new Response(JSON.stringify({ error: "No access token returned" }), { status: 400 });
    }

    const { id, displayName } = await fetchUserInfo(userInfoUrl, token.access_token);

    const redis = getRedis();
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);

    const user = await userStore.upsertOAuthUser(id, displayName);
    if (user.status !== "active") {
      return new Response(JSON.stringify({ error: "Account is disabled or deleted" }), {
        status: 403,
        headers: { "Set-Cookie": clearSessionCookie() }
      });
    }
    const session = await sessionStore.create(user.id);
    const maxAge = Number(process.env["SESSION_TTL_SECONDS"] ?? 60 * 60 * 24 * 7);
    return redirectWithCookie(storedState.returnTo ?? "/", buildSessionCookie(session.id, maxAge));
  } catch (err) {
    console.error("Auth callback failed", err);
    const message = (err as Error).message ?? "Authentication failed";
    const status = message.toLowerCase().includes("deleted") ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Set-Cookie": clearSessionCookie() }
    });
  }
}

