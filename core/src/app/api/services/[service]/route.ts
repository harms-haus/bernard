import { NextRequest, NextResponse } from "next/server"
import { ServiceManager } from "@/lib/services/ServiceManager"
import { SERVICES } from "@/lib/services/ServiceConfig"

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

  const manager = new ServiceManager()

  try {
    let result

    switch (command) {
      case "start":
        result = await manager.start(service)
        break
      case "stop":
        const stopResult = await manager.stop(service)
        result = { success: stopResult.success }
        break
      case "restart":
        result = await manager.restart(service)
        break
      case "check":
        result = await manager.check(service)
        break
      default:
        return NextResponse.json(
          { error: "Unknown command" },
          { status: 400 }
        )
    }

    return NextResponse.json({
      service,
      command,
      ...result,
    })
  } catch (error) {
    console.error(`[API] Failed to execute ${command} on ${service}:`, error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
