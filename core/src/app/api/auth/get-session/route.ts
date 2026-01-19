import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server-helpers";
import { logger } from "@/lib/logging/logger";

export async function GET() {
    try {
        const session = await requireAuth();
        if (!session) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        return NextResponse.json({ session });
    } catch (error) {
        logger.error({ error: (error as Error).message }, 'Error getting session');
        return NextResponse.json({ session: null }, { status: 500 });
    }
}
