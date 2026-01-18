import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/server-helpers";

/**
 * Validates and sanitizes a redirectTo parameter to prevent open redirects.
 * Only allows relative paths starting with a single slash.
 * @param redirectTo - The redirectTo value to validate
 * @param defaultPath - The default path to use if validation fails
 * @returns A safe redirect path
 */
function validateRedirectTo(redirectTo: string | undefined, defaultPath: string): string {
  if (!redirectTo || typeof redirectTo !== "string") {
    return defaultPath;
  }

  // Must start with a single slash (not //)
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return defaultPath;
  }

  // Must not contain a scheme (e.g., http:, https:, javascript:)
  if (redirectTo.includes(":/")) {
    return defaultPath;
  }

  // Must be a non-empty string
  if (redirectTo.trim().length === 0) {
    return defaultPath;
  }

  return redirectTo;
}

export default async function VerifyAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const params = await searchParams;
  const safeRedirectTo = validateRedirectTo(params.redirectTo, "/bernard/admin");

  const session = await getSession();

  if (!session || session.user.role !== "admin") {
    // Not authenticated or not admin - redirect to login
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = headersList.get("x-forwarded-proto") || "http";
    const origin = `${protocol}://${host}`;
    const loginUrl = new URL("/auth/login", origin);
    loginUrl.searchParams.set("redirectTo", safeRedirectTo);
    return Response.redirect(loginUrl);
  }

  // Admin verified - redirect to original destination
  redirect(safeRedirectTo);
}
