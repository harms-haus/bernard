import { NextRequest, NextResponse } from "next/server"
import { getServiceJobStatus } from "@/lib/infra/service-queue"
import { requireAuth } from "@/lib/auth/server-helpers"
import { logger } from "@/lib/logging/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: 'Session required' }, { status: 401 })
    const jobInfo = await getServiceJobStatus(jobId);

    if (!jobInfo) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(jobInfo);
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to get job status');
    return NextResponse.json(
      { error: "Failed to get job status" },
      { status: 500 }
    );
  }
}
