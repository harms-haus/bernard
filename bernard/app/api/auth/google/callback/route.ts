import type { NextRequest } from "next/server";
import { getProviderConfig } from "@/lib/auth/oauth";
import { buildSessionCookie, validateRedirectUrl } from "@/lib/auth/auth";
import { UserStore } from "@/lib/auth/userStore";
import { SessionStore } from "@/lib/auth/sessionStore";
import { getRedis } from "@/lib/infra/redis";

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    console.log("GET /google/callback - Processing Google OAuth callback");

    if (!code || typeof code !== "string") {
      console.warn("GET /google/callback - Missing code parameter");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_code" }
      });
    }

    const config = await getProviderConfig("google");

    // Exchange code for token
    console.log("GET /google/callback - Exchanging code for token");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret || "",
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("GET /google/callback - Token exchange failed:", errorText);
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_exchange_failed" }
      });
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      console.error("GET /google/callback - No access token in response");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_token" }
      });
    }

    // Get user profile
    console.log("GET /google/callback - Fetching user profile");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error("GET /google/callback - Profile fetch failed:", errorText);
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=profile_fetch_failed" }
      });
    }

    const profile = await profileResponse.json();

    // Find or create user
    console.log(`GET /google/callback - Finding or creating user: ${profile.email}`);
    const redis = getRedis();
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);

    if (!profile.id) {
      console.error("GET /google/callback - Profile missing id field");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=profile_incomplete" }
      });
    }

    const user = await userStore.upsertOAuthUser(
      String(profile.id),
      profile.name || profile.given_name || profile.email || "Google User"
    );

    if (user.status !== "active") {
      console.error("GET /google/callback - User account is not active");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=account_inactive" }
      });
    }

    // Create session
    const session = await sessionStore.create(user.id);
    const maxAge = Number(process.env["SESSION_TTL_SECONDS"] ?? 60 * 60 * 24 * 7);
    const cookie = buildSessionCookie(session.id, maxAge);

    // Parse redirect from state
    let redirect = "/";
    try {
      if (state && typeof state === "string") {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        redirect = validateRedirectUrl(stateData.redirect);
      }
    } catch {
      // Invalid state, use default
      console.warn("GET /google/callback - Invalid state format, using default redirect");
    }

    console.log(`GET /google/callback - OAuth successful for user ${user.id}, redirecting to ${redirect}`);
    
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirect,
        "Set-Cookie": cookie
      }
    });
  } catch (error) {
    console.error("GET /google/callback - Google OAuth error:", error);
    console.error("GET /google/callback - Error stack:", (error as Error).stack);
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?error=oauth_failed" }
    });
  }
}

export const runtime = "nodejs";