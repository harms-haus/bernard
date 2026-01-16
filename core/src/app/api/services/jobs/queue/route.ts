import { NextRequest, NextResponse } from "next/server"
import { getServiceJobs } from "@/lib/infra/service-queue"
import { requireAuth } from "@/lib/auth/server-helpers"
import { ok, error } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const serviceId = searchParams.get("service");

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: 'Session required' }, { status: 401 })
    const jobs = serviceId
      ? await getServiceJobs(serviceId)
      : await getServiceJobs();

    return ok(jobs)
  } catch (e) {
    console.error('[API] Failed to get service jobs:', e);
    return error("Failed to get queue status", 500)
  }
}
