import { NextRequest, NextResponse } from "next/server"
import { ServiceManager } from "@/lib/services/ServiceManager"
import { SERVICES } from "@/lib/services/ServiceConfig"
import { addServiceJob } from "@/lib/infra/service-queue"
import { initializeServiceQueue } from "@/lib/infra/service-queue/init"
import type { ServiceAction } from "@/lib/infra/service-queue/types"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const config = SERVICES[service]

  if (!config) {
    return NextResponse.json(
      { error: "Service not found" },
      { status: 404 }
    )
  }

  const manager = new ServiceManager()

  try {
    const [status, health] = await Promise.all([
      manager.getStatus(service),
      manager.healthCheck(service),
    ])

    return NextResponse.json({
      config,
      status,
      health,
    })
  } catch (error) {
    console.error(`[API] Failed to get service ${service}:`, error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const config = SERVICES[service]

  if (!config) {
    return NextResponse.json(
      { error: "Service not found" },
      { status: 404 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { command } = body

  if (!command || !["start", "stop", "restart", "check"].includes(command)) {
    return NextResponse.json(
      { error: "Invalid command. Use: start, stop, restart, or check" },
      { status: 400 }
    )
  }

  await initializeServiceQueue();

  try {
    const jobId = await addServiceJob(service, command as ServiceAction, {
      initiatedBy: 'api',
    });

    return NextResponse.json({
      service,
      command,
      jobId,
      status: 'queued',
      message: 'Action queued for execution',
    });
  } catch (error) {
    console.error(`[API] Failed to queue ${command} for ${service}:`, error);
    return NextResponse.json(
      { error: "Failed to queue action" },
      { status: 500 }
    )
  }
}
