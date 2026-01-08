import { NextRequest, NextResponse } from "next/server"
import { ServiceManager } from "@/lib/services/ServiceManager"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const serviceId = searchParams.get("service") || undefined

  const manager = new ServiceManager()

  try {
    if (serviceId) {
      const status = await manager.getStatus(serviceId)
      if (!status) {
        return NextResponse.json(
          { error: "Service not found" },
          { status: 404 }
        )
      }
      return NextResponse.json(status)
    }

    const statuses = await manager.getAllStatus()
    return NextResponse.json(statuses)
  } catch (error) {
    console.error("[API] Failed to get service status:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
