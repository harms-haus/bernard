import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server-helpers";

export async function GET() {
    try {
        const session = await requireAuth();
        if (!session) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        return NextResponse.json({ session });
    } catch (error) {
        console.error("Error getting session:", error);
        return NextResponse.json({ session: null }, { status: 500 });
    }
}
