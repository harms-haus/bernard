import { auth } from "./auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const getSession = async () => {
    const headersList = await headers();
    const headersObj: Record<string, string> = {};
    headersList.forEach((value, key) => {
        headersObj[key] = value;
    });
    return await auth.api.getSession({
        headers: headersObj,
    });
}

export async function requireAuth() {
    const session = await getSession();

    return session;
}

export async function requireAdmin() {
    const session = await getSession();

    return session?.user.role === "admin" ? session : null;
}

/**
 * Deny access to guest users.
 * Returns the session if the user is authenticated and not a guest.
 * Returns null if the user is not authenticated OR is a guest.
 */
export async function denyGuest() {
    const session = await getSession();
    if (!session) {
        return null; // Not authenticated
    }
    if (session.user.role === "guest") {
        return null; // Deny access to guests
    }
    return session;
}

/**
 * Require a non-guest user (alias for denyGuest with clearer intent).
 * Use this when you want to explicitly require authenticated non-guest access.
 */
export async function requireNonGuest() {
    return denyGuest();
}
