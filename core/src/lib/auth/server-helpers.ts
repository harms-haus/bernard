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
