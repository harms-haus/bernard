import type { NextRequest } from "next/server";
import crypto from "node:crypto";

import { buildSessionCookie, clearSessionCookie } from "./auth";
import { getRedis } from "../infra/redis";
import { SessionStore } from "./sessionStore";
import { UserStore } from "./userStore";
import { SettingsStore } from "../config/settingsStore";
import { logger } from "../logging";

export type OAuthProvider = "default" | "google" | "github";
export type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
  scope: string;
  clientId: string;
  clientSecret?: string;
};

const STATE_TTL_SECONDS = 10 * 60;
const STATE_NAMESPACE = "bernard:oauth:state";

const base64Encode = (buffer: Buffer) => buffer.toString("base64");

const base64UrlEncode = (buffer: Buffer) =>
  buffer.toString("base64")
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

const createCodeVerifier = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const length = 64; // Between 43-128 as required by RFC 7636
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const createChallenge = (verifier: string) => base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());

const scopedEnv = (provider: OAuthProvider, key: string, fallback?: string) => {
  const scopedKey = `OAUTH_${provider.toUpperCase()}_${key}`;
  return process.env[scopedKey] ?? fallback;
};

const fallbackProviderConfig = (provider: OAuthProvider): ProviderConfig => {
  const scopeFallback =
    provider === "google" ? "openid profile email" : provider === "github" ? "read:user user:email" : "openid profile";

  const config = {
    authUrl: scopedEnv(provider, "AUTH_URL", process.env["OAUTH_AUTH_URL"]),
    tokenUrl: scopedEnv(provider, "TOKEN_URL", process.env["OAUTH_TOKEN_URL"]),
    userInfoUrl: scopedEnv(provider, "USERINFO_URL", process.env["OAUTH_USERINFO_URL"]),
    redirectUri: scopedEnv(provider, "REDIRECT_URI", process.env["OAUTH_REDIRECT_URI"]),
    scope: scopedEnv(provider, "SCOPES", process.env["OAUTH_SCOPES"]) ?? scopeFallback,
    clientId: scopedEnv(provider, "CLIENT_ID", process.env["OAUTH_CLIENT_ID"] ?? ""),
    clientSecret: scopedEnv(provider, "CLIENT_SECRET", process.env["OAUTH_CLIENT_SECRET"])
  };

  const missing = Object.entries(config)
    .filter(([k, v]) => !v && k !== "clientSecret")
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`OAuth is not configured for ${provider}: missing ${missing.join(", ")}`);
  }

  return {
    authUrl: config.authUrl!,
    tokenUrl: config.tokenUrl!,
    userInfoUrl: config.userInfoUrl!,
    redirectUri: config.redirectUri!,
    scope: config.scope,
    clientId: config.clientId!,
    ...(config.clientSecret ? { clientSecret: config.clientSecret } : {})
  };
};

export const getProviderConfig = async (provider: OAuthProvider): Promise<ProviderConfig> => {
  const settingsStore = new SettingsStore();
  const settings = await settingsStore.getOAuth().catch(() => null);
  const fromSettings =
    provider === "google"
      ? settings?.google
      : provider === "github"
        ? settings?.github
        : settings?.default;

  if (fromSettings?.authUrl && fromSettings.tokenUrl && fromSettings.userInfoUrl && fromSettings.redirectUri) {
    const { authUrl, tokenUrl, userInfoUrl, redirectUri, scope, clientId, clientSecret } = fromSettings;
    return {
      authUrl,
      tokenUrl,
      userInfoUrl,
      redirectUri,
      scope,
      clientId,
      ...(clientSecret ? { clientSecret } : {})
    };
  }
  return fallbackProviderConfig(provider);
};

const stateKey = (provider: OAuthProvider, state: string) => `${STATE_NAMESPACE}:${provider}:${state}`;

export async function startOAuthLogin(provider: OAuthProvider, req: NextRequest) {
  const { authUrl, clientId, redirectUri, scope } = await getProviderConfig(provider);
  logger.info({ event: 'oauth.start', provider, redirectUri }, `OAuth start: redirectUri=${redirectUri}`);
  const state = base64Encode(crypto.randomBytes(24));
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createChallenge(codeVerifier);

  const url = new URL(req.url);
  const returnTo = url.searchParams.get('redirect') ?? "/";

  const redis = getRedis();
  await redis.set(stateKey(provider, state), JSON.stringify({ codeVerifier, returnTo }), "EX", STATE_TTL_SECONDS);

  const authorizeUrl = new URL(authUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  // Add Google-specific parameters
  if (provider === "google") {
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString()
    }
  });
}

const parseState = async (provider: OAuthProvider, state: string): Promise<{ codeVerifier: string; returnTo: string } | null> => {
  const redis = getRedis();
  const raw = await redis.get(stateKey(provider, state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { codeVerifier: string; returnTo: string };
  } catch (err) {
    logger.error({ event: 'oauth.state.parse_error', provider, error: err instanceof Error ? err.message : String(err) }, "Failed to parse OAuth state");
    return null;
  }
};

const deleteState = async (provider: OAuthProvider, state: string) => {
  const redis = getRedis();
  await redis.del(stateKey(provider, state));
};

const exchangeCode = async (provider: OAuthProvider, config: ProviderConfig, code: string, codeVerifier: string) => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: config.clientId,
    redirect_uri: config.redirectUri
  });
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (provider === "github") {
    headers["Accept"] = "application/json";
  }
  const resp = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Token exchange failed (${provider}, ${resp.status}): ${detail}`);
  }
  const contentType = resp.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await resp.json()) as { access_token?: string };
  }
  const text = await resp.text();
  const params = new URLSearchParams(text);
  return { access_token: params.get("access_token") ?? undefined };
};

const fetchUserInfo = async (provider: OAuthProvider, userInfoUrl: string, accessToken: string) => {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (provider === "github") {
    headers["Accept"] = "application/vnd.github+json";
    headers["User-Agent"] = "bernard-admin";
  }
  const resp = await fetch(userInfoUrl, { headers });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Userinfo failed (${provider}, ${resp.status}): ${detail}`);
  }
  const data = (await resp.json()) as Record<string, string>;
  const id = data["sub"] ?? data["id"] ?? data["node_id"];
  if (!id) {
    throw new Error("Userinfo response missing subject");
  }
  const displayName =
    data["name"] ??
    data["preferred_username"] ??
    data["login"] ??
    data["email"] ??
    data["username"] ??
    id;
  return { id, displayName };
};

export async function handleOAuthCallback(provider: OAuthProvider, req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/login?error=no_code",
        "Set-Cookie": clearSessionCookie()
      }
    });
  }

  try {
    const storedState = await parseState(provider, state);
    if (!storedState) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/login?error=invalid_state",
          "Set-Cookie": clearSessionCookie()
        }
      });
    }
    await deleteState(provider, state);
    const config = await getProviderConfig(provider);
    const token = await exchangeCode(provider, config, code, storedState.codeVerifier);
    if (!token.access_token) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/login?error=no_token",
          "Set-Cookie": clearSessionCookie()
        }
      });
    }
    const { id, displayName } = await fetchUserInfo(provider, config.userInfoUrl, token.access_token);
    const redis = getRedis();
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);
    const user = await userStore.upsertOAuthUser(id, displayName);
    if (user.status !== "active") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/login?error=account_disabled",
          "Set-Cookie": clearSessionCookie()
        }
      });
    }
    const session = await sessionStore.create(user.id);
    const maxAge = Number(process.env["SESSION_TTL_SECONDS"] ?? 60 * 60 * 24 * 7);

    return new Response(null, {
      status: 302,
      headers: {
        Location: storedState.returnTo ?? "/",
        "Set-Cookie": buildSessionCookie(session.id, maxAge)
      }
    });
  } catch (err) {
    logger.error({
      event: 'oauth.callback.error',
      provider,
      error: err instanceof Error ? err.message : String(err)
    }, `Auth callback failed (${provider})`);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/login?error=auth_failed",
        "Set-Cookie": clearSessionCookie()
      }
    });
  }
}

