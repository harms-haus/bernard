import type { NextRequest } from "next/server";
import { getProviderConfig } from "@/lib/auth/oauth";
import { randomBytes } from "crypto";
import { getRedis } from "@/lib/infra/redis";

/**
 * GET /api/auth/github/login
 * Initiate GitHub OAuth flow - redirects to GitHub
 */
export async function GET(req: NextRequest) {
  try {
    const config = await getProviderConfig("github");
    
    // Generate CSRF token
    const csrfToken = randomBytes(32).toString("hex");
    
    // Store CSRF token in Redis with a short TTL (10 minutes)
    const redis = getRedis();
    const csrfKey = `csrf:${csrfToken}`;
    await redis.setex(csrfKey, 600, csrfToken); // 10 minutes TTL
    
    // Include CSRF token in state
    const state = Buffer.from(JSON.stringify({
      redirect: req.nextUrl.searchParams.get("redirect") || "/",
      csrf: csrfToken
    })).toString("base64");

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope,
      state,
    });

    const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    console.log("GET /github/login - Redirecting to GitHub OAuth");
    return Response.redirect(githubAuthUrl, 302);
  } catch (err) {
    console.error("GET /github/login - Error initiating GitHub OAuth:", err);
    return new Response(JSON.stringify({ error: "Unable to start GitHub OAuth" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export const runtime = "nodejs";