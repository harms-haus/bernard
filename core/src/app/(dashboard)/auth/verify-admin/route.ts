import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-helpers";

/**
 * Validates and sanitizes a redirectTo parameter to prevent open redirects.
 * Only allows relative paths starting with a single slash.
 * @param redirectTo - The redirectTo value to validate
 * @param defaultPath - The default path to use if validation fails
 * @returns A safe redirect path
 */
function validateRedirectTo(redirectTo: string | null, defaultPath: string): string {
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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const safeRedirectTo = validateRedirectTo(searchParams.get("redirectTo"), "/");

    const session = await requireAdmin();

    if (!session) {
        // Not authenticated or not admin - redirect to login
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("redirectTo", safeRedirectTo);
        return NextResponse.redirect(loginUrl);
    }

    // Admin verified - allow access to the original destination
    return NextResponse.redirect(new URL(safeRedirectTo, request.url));
}
