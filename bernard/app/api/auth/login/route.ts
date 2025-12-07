import type { NextRequest } from "next/server";
import crypto from "node:crypto";

import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

const STATE_TTL_SECONDS = 10 * 60;
const STATE_NAMESPACE = "bernard:oauth:state";

const base64UrlEncode = (buffer: Buffer) =>
  buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const createCodeVerifier = () => base64UrlEncode(crypto.randomBytes(64));

const createChallenge = (verifier: string) => base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());

const requiredEnv = () => {
  const authUrl = process.env["OAUTH_AUTH_URL"];
  const clientId = process.env["OAUTH_CLIENT_ID"];
  const redirectUri = process.env["OAUTH_REDIRECT_URI"];
  const scope = process.env["OAUTH_SCOPES"] ?? "openid profile";
  if (!authUrl || !clientId || !redirectUri) {
    throw new Error("OAuth is not configured");
  }
  return { authUrl, clientId, redirectUri, scope };
};

export async function GET(req: NextRequest) {
  try {
    const { authUrl, clientId, redirectUri, scope } = requiredEnv();
    const state = base64UrlEncode(crypto.randomBytes(24));
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createChallenge(codeVerifier);

    const returnTo = new URL(req.url).searchParams.get("redirect") ?? "/";
    const redis = getRedis();
    await redis.set(
      `${STATE_NAMESPACE}:${state}`,
      JSON.stringify({ codeVerifier, returnTo }),
      "EX",
      STATE_TTL_SECONDS
    );

    const authorizeUrl = new URL(authUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return Response.redirect(authorizeUrl.toString(), 302);
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to start login" }), {
      status: 500
    });
  }
}

