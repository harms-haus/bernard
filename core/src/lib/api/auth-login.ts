import { NextRequest, NextResponse } from "next/server";
import { error } from "./response";
import { auth } from "@/lib/auth/better-auth";

export interface LoginBody {
  provider?: string;
  returnTo?: string;
}

export function validateReturnTo(returnTo: string): boolean {
  if (!returnTo || typeof returnTo !== "string") {
    return false;
  }

  // Allow relative paths: must start with '/' but not '//' (to avoid protocol-relative URLs)
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return true;
  }

  // Check if it's an absolute URL
  try {
    const url = new URL(returnTo);

    // Reject URLs with schemes (http, https, ftp, etc.)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    // Get allowed redirect domains from environment (comma-separated)
    const allowedDomains = process.env.ALLOWED_REDIRECT_DOMAINS
      ? process.env.ALLOWED_REDIRECT_DOMAINS.split(",").map((d) => d.trim())
      : [];

    // Allow if the hostname is in the whitelist
    return allowedDomains.includes(url.hostname);
  } catch {
    // Invalid URL format
    return false;
  }
}

export function validateLoginBody(body: unknown): body is LoginBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.provider !== undefined && typeof b.provider !== "string") return false;
  if (
    b.returnTo !== undefined &&
    (typeof b.returnTo !== "string" || !validateReturnTo(b.returnTo))
  )
    return false;
  return true;
}

export async function handleLogin(body: LoginBody): Promise<NextResponse> {
  const { provider, returnTo = "/bernard/chat" } = body;

  if (!provider) {
    return error("Provider is required", 400);
  }

  // Validate returnTo for security (prevent open redirect)
  if (!validateReturnTo(returnTo)) {
    return error("Invalid returnTo parameter", 400);
  }

  try {
    // BetterAuth handles OAuth sign-in by redirecting to the provider
    // Return a redirect response to the BetterAuth sign-in endpoint
    const signInURL = new URL("/api/auth/sign-in/social", process.env.BETTER_AUTH_URL || "http://localhost:3456");
    signInURL.searchParams.set("provider", provider);
    signInURL.searchParams.set("callbackURL", returnTo);

    return NextResponse.redirect(signInURL.toString());
  } catch (err) {
    console.error("Failed to initiate login:", err);
    return error("Failed to initiate login", 500);
  }
}
