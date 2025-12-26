import type { NextRequest } from "next/server";
import { getProviderConfig } from "@/lib/auth/oauth";
import { buildSessionCookie, validateRedirectUrl } from "@/lib/auth/auth";
import { UserStore } from "@/lib/auth/userStore";
import { SessionStore } from "@/lib/auth/sessionStore";
import { getRedis } from "@/lib/infra/redis";
import { logger } from "@/lib/logging";

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
}

interface GitHubProfile {
  id: number;
  name: string | null;
  login: string;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * GET /api/auth/github/callback
 * Handle GitHub OAuth callback
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    logger.info({ event: "auth.github.callback.start" }, "Processing GitHub OAuth callback");

    if (!code || typeof code !== "string") {
      logger.error({ event: "auth.github.callback.error", reason: "missing_code" }, "GitHub OAuth callback: Missing code parameter");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_code" }
      });
    }

    const config = await getProviderConfig("github");

    logger.info({ event: "auth.github.token_exchange.start" }, "GitHub OAuth callback: Exchanging code for token...");

    // Exchange code for token
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUri,
        })
      });
    } catch (tokenError: unknown) {
      logger.error({ event: "auth.github.token_exchange.error", error: tokenError instanceof Error ? tokenError.message : String(tokenError) }, "GitHub token exchange error");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_exchange_failed" }
      });
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error({ event: "auth.github.token_exchange.failed", status: tokenResponse.status, error: errorText }, "GitHub token exchange failed");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_exchange_failed" }
      });
    }

    const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
    const { access_token, error: tokenError } = tokenData;

    if (tokenError) {
      logger.error({ event: "auth.github.token_exchange.returned_error", error: tokenError }, "GitHub token exchange returned error");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_error" }
      });
    }

    if (!access_token) {
      logger.error({ event: "auth.github.token_exchange.no_token" }, "GitHub token exchange: No access token in response");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_token" }
      });
    }

    logger.info({ event: "auth.github.profile.fetch.start" }, "GitHub OAuth: Token received, fetching user profile...");

    // Get user profile
    let profile: GitHubProfile;
    try {
      const profileResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        logger.error({ event: "auth.github.profile.fetch.failed", status: profileResponse.status, error: errorText }, "GitHub profile fetch failed");
        return Response.redirect("/login?error=profile_fetch_failed", 302);
      }

      profile = (await profileResponse.json()) as GitHubProfile;
    } catch (profileError: unknown) {
      logger.error({ event: "auth.github.profile.fetch.error", error: profileError instanceof Error ? profileError.message : String(profileError) }, "GitHub profile fetch error");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=profile_fetch_failed" }
      });
    }

    // Get user email (may need to fetch from emails endpoint)
    let email = profile.email;
    if (!email) {
      try {
        const emailsResponse = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!emailsResponse.ok) {
          const errorText = await emailsResponse.text();
          logger.error({ event: "auth.github.email.fetch.failed", status: emailsResponse.status, error: errorText }, "GitHub email fetch failed");
          // Continue with fallback email
        } else {
          const emails = (await emailsResponse.json()) as GitHubEmail[];
          const primaryEmail = emails.find((e) => e.primary);
          email = primaryEmail ? primaryEmail.email : emails[0]?.email || `${profile.id}@users.noreply.github.com`;
        }
      } catch (emailError: unknown) {
        logger.error({ event: "auth.github.email.fetch.error", error: emailError instanceof Error ? emailError.message : String(emailError) }, "GitHub email fetch error");
        // Continue with fallback email
        email = `${profile.id}@users.noreply.github.com`;
      }
    }

    logger.info({ event: "auth.github.user_upsert.start", githubId: profile.id }, "GitHub OAuth: Finding or creating user...");

    // Find or create user
    const redis = getRedis();
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);

    const user = await userStore.upsertOAuthUser(
      String(profile.id),
      profile.name || profile.login || email || "GitHub User"
    );

    if (user.status !== "active") {
      logger.error({ event: "auth.github.user.inactive", userId: user.id }, "User account is not active");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=account_inactive" }
      });
    }

    logger.info({ event: "auth.github.session.create", userId: user.id }, "GitHub OAuth: Generating session...");

    // Create session
    const session = await sessionStore.create(user.id);
    const maxAge = Number(process.env["SESSION_TTL_SECONDS"] ?? 60 * 60 * 24 * 7);

    // Parse and validate state
    let redirect = "/bernard/chat";
    try {
      if (state && typeof state === "string") {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString()) as { csrf?: unknown; redirect?: unknown };
        
        // Validate CSRF token
        if (!stateData.csrf || typeof stateData.csrf !== "string") {
          logger.error({ event: "auth.github.csrf.missing" }, "GitHub OAuth callback: Missing CSRF token in state");
          return new Response(null, {
            status: 302,
            headers: { Location: "/login?error=csrf_missing" }
          });
        }

        const csrfKey = `csrf:${stateData.csrf}`;
        const deleted = await redis.del(csrfKey);

        if (deleted === 0) {
          logger.error({ event: "auth.github.csrf.invalid" }, "GitHub OAuth callback: Invalid or expired CSRF token");
          return new Response(null, {
            status: 302,
            headers: { Location: "/login?error=csrf_invalid" }
          });
        }

        redirect = validateRedirectUrl(typeof stateData.redirect === "string" ? stateData.redirect : undefined);
      }
    } catch (error: unknown) {
      logger.error({ event: "auth.github.state.parse_error", error: error instanceof Error ? error.message : String(error) }, "GitHub OAuth callback: Error parsing state");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=invalid_state" }
      });
    }

    logger.info({ event: "auth.github.success", userId: user.id }, "GitHub OAuth: Success! Redirecting to frontend...");

    const redirectUrl = redirect;

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        "Set-Cookie": buildSessionCookie(session.id, maxAge)
      }
    });
  } catch (error: unknown) {
    logger.error({ 
      event: "auth.github.callback.fatal", 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, "GitHub OAuth error");
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?error=oauth_failed" }
    });
  }
}

export const runtime = "nodejs";