import { NextRequest, NextResponse } from "next/server"
import { getQueueStats } from "@/lib/infra/service-queue"

export async function GET() {
  try {
    const stats = await getQueueStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[API] Failed to get queue stats:', error);
    return NextResponse.json(
      { error: "Failed to get queue statistics" },
      { status: 500 }
    );
  }
}
