import crypto from "node:crypto";
import { UserStore } from "./userStore";
import { SessionStore } from "./sessionStore";
import { ProviderConfig, OAuthProvider } from "./types";

const STATE_TTL_SECONDS = 10 * 60;
const STATE_NAMESPACE = "bernard:oauth:state";

export const base64Encode = (buffer: Buffer) => buffer.toString("base64");

export const base64UrlEncode = (buffer: Buffer) =>
  buffer.toString("base64")
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

export const createCodeVerifier = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const length = 64;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const createChallenge = (verifier: string) => base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());

export const exchangeCode = async (provider: OAuthProvider, config: ProviderConfig, code: string, codeVerifier: string) => {
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

export const fetchUserInfo = async (provider: OAuthProvider, userInfoUrl: string, accessToken: string): Promise<{ id: string; displayName: string; email?: string; avatarUrl?: string }> => {
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
  const data = (await resp.json()) as Record<string, unknown>;
  const id = data["sub"] ?? data["id"] ?? data["node_id"];
  if (!id) {
    throw new Error("Userinfo response missing subject");
  }
  const displayName =
    (data["name"] as string | undefined) ??
    (data["preferred_username"] as string | undefined) ??
    (data["login"] as string | undefined) ??
    (data["email"] as string | undefined) ??
    (data["username"] as string | undefined) ??
    String(id);
  const email = data["email"] as string | undefined;
  const avatarUrl = (data["avatar_url"] as string | undefined) ?? (data["picture"] as string | undefined);
  
  const result: { id: string; displayName: string; email?: string; avatarUrl?: string } = { 
    id: String(id), 
    displayName 
  };
  if (email) result.email = email;
  if (avatarUrl) result.avatarUrl = avatarUrl;
  
  return result;
};

