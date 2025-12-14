import type { NextRequest } from "next/server";
import { getProviderConfig } from "@/lib/auth/oauth";
import { randomBytes } from "crypto";
import { getRedis } from "@/lib/infra";

/**
 * GET /api/auth/google/login
 * Initiate Google OAuth flow - redirects to Google
 */
export async function GET(req: NextRequest) {
  try {
    const config = await getProviderConfig("google");
    const csrfToken = randomBytes(32).toString("hex");
    const redis = getRedis();
    const csrfKey = `csrf:${csrfToken}`;
    await redis.setex(csrfKey, 600, csrfToken); // 10 minutes TTL
    const state = Buffer.from(JSON.stringify({ redirect: req.nextUrl.searchParams.get("redirect") || "/", csrf: csrfToken })).toString("base64");

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scope,
      state,
      access_type: "offline",
      prompt: "consent",
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log("GET /google/login - Redirecting to Google OAuth");
    return Response.redirect(googleAuthUrl, 302);
  } catch (err) {
    console.error("GET /google/login - Error initiating Google OAuth:", err);
    return new Response(JSON.stringify({ error: "Unable to start Google OAuth" }), {
      status: 500
    });
  }
}

export const runtime = "nodejs";