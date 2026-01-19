import { NextRequest, NextResponse } from "next/server"
import { getQueueStats } from "@/lib/infra/service-queue"
import { requireAuth } from "@/lib/auth/server-helpers"
import { logger } from "@/lib/logging/logger";

export async function GET() {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: 'Session required' }, { status: 401 })
    const stats = await getQueueStats();
    return NextResponse.json(stats);
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to get queue stats');
    return NextResponse.json(
      { error: "Failed to get queue statistics" },
      { status: 500 }
    );
  }
}
