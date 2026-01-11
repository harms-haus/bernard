import { NextRequest, NextResponse } from "next/server"
import { getServiceJobs } from "@/lib/infra/service-queue"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const serviceId = searchParams.get("service");

  try {
    const jobs = serviceId
      ? await getServiceJobs(serviceId)
      : await getServiceJobs();

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[API] Failed to get service jobs:', error);
    return NextResponse.json(
      { error: "Failed to get queue status" },
      { status: 500 }
    );
  }
}
