import { NextRequest, NextResponse } from "next/server"
import { getServiceManager } from "../../../lib/api/factory"
import { error, ok } from "../../../lib/api/response"
import type { ServiceStatus } from "../../../lib/services/ServiceManager"

async function handleGetServices(_request: NextRequest): Promise<NextResponse> {
  try {
    const manager = getServiceManager()
    const statuses = await manager.getAllStatus()
    return ok(statuses)
  } catch {
    return error("Failed to get service status", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleGetServices(request)
}
