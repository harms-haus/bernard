import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-helpers";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const redirectTo = searchParams.get("redirectTo") || "/";

    const session = await requireAdmin();

    if (!session) {
        // Not authenticated or not admin - redirect to login
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("redirectTo", redirectTo);
        return NextResponse.redirect(loginUrl);
    }

    // Admin verified - allow access to the original destination
    return NextResponse.redirect(new URL(redirectTo, request.url));
}
