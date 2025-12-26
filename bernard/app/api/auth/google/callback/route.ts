import type { NextRequest } from "next/server";
import { getProviderConfig } from "@/lib/auth/oauth";
import { buildSessionCookie, validateRedirectUrl } from "@/lib/auth/auth";
import { UserStore } from "@/lib/auth/userStore";
import { SessionStore } from "@/lib/auth/sessionStore";
import { getRedis } from "@/lib/infra/redis";
import { logger } from "@/lib/logging";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleProfile {
  id: string;
  email: string;
  name?: string;
  given_name?: string;
}

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    logger.info({ event: "auth.google.callback.start" }, "Processing Google OAuth callback");

    if (!code || typeof code !== "string") {
      logger.warn({ event: "auth.google.callback.error", reason: "missing_code" }, "Missing code parameter");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_code" }
      });
    }

    const config = await getProviderConfig("google");

    // Exchange code for token
    logger.info({ event: "auth.google.token_exchange.start" }, "Exchanging code for token");
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
      logger.error({ event: "auth.google.token_exchange.failed", status: tokenResponse.status, error: errorText }, "Token exchange failed");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_exchange_failed" }
      });
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
    const { access_token } = tokenData;

    if (!access_token) {
      logger.error({ event: "auth.google.token_exchange.no_token" }, "No access token in response");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_token" }
      });
    }

    // Get user profile
    logger.info({ event: "auth.google.profile.fetch.start" }, "Fetching user profile");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      logger.error({ event: "auth.google.profile.fetch.failed", status: profileResponse.status, error: errorText }, "Profile fetch failed");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=profile_fetch_failed" }
      });
    }

    const profile = (await profileResponse.json()) as GoogleProfile;

    // Find or create user
    logger.info({ event: "auth.google.user_upsert.start", email: profile.email }, `Finding or creating user: ${profile.email}`);
    const redis = getRedis();
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);

    if (!profile.id) {
      logger.error({ event: "auth.google.profile.incomplete" }, "Profile missing id field");
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
      logger.error({ event: "auth.google.user.inactive", userId: user.id }, "User account is not active");
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
        const stateData = JSON.parse(Buffer.from(state, "base64").toString()) as { redirect?: unknown };
        redirect = validateRedirectUrl(typeof stateData.redirect === "string" ? stateData.redirect : undefined);
      }
    } catch {
      // Invalid state, use default
      logger.warn({ event: "auth.google.state.invalid" }, "Invalid state format, using default redirect");
    }

    logger.info({ event: "auth.google.success", userId: user.id, redirect }, `OAuth successful for user ${user.id}, redirecting to ${redirect}`);
    
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirect,
        "Set-Cookie": cookie
      }
    });
  } catch (error: unknown) {
    logger.error({ 
      event: "auth.google.callback.fatal", 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, "Google OAuth error");
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?error=oauth_failed" }
    });
  }
}

export const runtime = "nodejs";