import type { NextRequest } from "next/server";
import { getProviderConfig } from "@/lib/auth/oauth";
import { buildSessionCookie, validateRedirectUrl } from "@/lib/auth/auth";
import { UserStore } from "@/lib/auth/userStore";
import { SessionStore } from "@/lib/auth/sessionStore";
import { getRedis } from "@/lib/infra/redis";

/**
 * GET /api/auth/github/callback
 * Handle GitHub OAuth callback
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    console.log("GET /github/callback - Processing GitHub OAuth callback");

    if (!code || typeof code !== "string") {
      console.error("GitHub OAuth callback: Missing code parameter");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_code" }
      });
    }

    const config = await getProviderConfig("github");

    console.log("GitHub OAuth callback: Exchanging code for token...");

    // Exchange code for token
    let tokenResponse;
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
    } catch (tokenError: any) {
      console.error("GitHub token exchange error:", tokenError);
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_exchange_failed" }
      });
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("GitHub token exchange failed:", errorText);
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_exchange_failed" }
      });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, error: tokenError } = tokenData;

    if (tokenError) {
      console.error("GitHub token exchange returned error:", tokenError);
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=token_error" }
      });
    }

    if (!access_token) {
      console.error("GitHub token exchange: No access token in response");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=no_token" }
      });
    }

    console.log("GitHub OAuth: Token received, fetching user profile...");

    // Get user profile
    let profile;
    try {
      const profileResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        console.error("GitHub profile fetch failed:", errorText);
        return Response.redirect("/login?error=profile_fetch_failed", 302);
      }

      profile = await profileResponse.json();
      } catch (profileError: any) {
        console.error("GitHub profile fetch error:", profileError);
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
          console.error("GitHub email fetch failed:", errorText);
          // Continue with fallback email
        } else {
          const emails = await emailsResponse.json();
          const primaryEmail = emails.find((e: any) => e.primary);
          email = primaryEmail ? primaryEmail.email : emails[0]?.email || `${profile.id}@users.noreply.github.com`;
        }
      } catch (emailError: any) {
        console.error("GitHub email fetch error:", emailError);
        // Continue with fallback email
        email = `${profile.id}@users.noreply.github.com`;
      }
    }

    console.log("GitHub OAuth: Finding or creating user...");

    // Find or create user
    const redis = getRedis();
    const userStore = new UserStore(redis);
    const sessionStore = new SessionStore(redis);

    const user = await userStore.upsertOAuthUser(
      String(profile.id),
      profile.name || profile.login || email || "GitHub User"
    );

    if (user.status !== "active") {
      console.error("User account is not active");
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=account_inactive" }
      });
    }

    console.log("GitHub OAuth: Generating session...");

    // Create session
    const session = await sessionStore.create(user.id);
    const maxAge = Number(process.env["SESSION_TTL_SECONDS"] ?? 60 * 60 * 24 * 7);

    // Parse and validate state
    let redirect = "/";
    try {
      if (state && typeof state === "string") {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        
        // Validate CSRF token
        if (!stateData.csrf || typeof stateData.csrf !== "string") {
          console.error("GitHub OAuth callback: Missing CSRF token in state");
          return new Response(null, {
            status: 302,
            headers: { Location: "/login?error=csrf_missing" }
          });
        }

        const csrfKey = `csrf:${stateData.csrf}`;
        const deleted = await redis.del(csrfKey);

        if (deleted === 0) {
          console.error("GitHub OAuth callback: Invalid or expired CSRF token");
          return new Response(null, {
            status: 302,
            headers: { Location: "/login?error=csrf_invalid" }
          });
        }

        redirect = validateRedirectUrl(stateData.redirect);
      }
    } catch (error) {
      console.error("GitHub OAuth callback: Error parsing state:", error);
      return new Response(null, {
        status: 302,
        headers: { Location: "/login?error=invalid_state" }
      });
    }

    console.log("GitHub OAuth: Success! Redirecting to frontend...");

    const redirectUrl = redirect;

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        "Set-Cookie": buildSessionCookie(session.id, maxAge)
      }
    });
  } catch (error: any) {
    console.error("GitHub OAuth error:", error);
    console.error("Error stack:", error.stack);
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?error=oauth_failed" }
    });
  }
}

export const runtime = "nodejs";