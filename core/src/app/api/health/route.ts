import { NextRequest, NextResponse } from "next/server"
import { getHealthChecker } from "../../../lib/api/factory"
import { error, ok } from "../../../lib/api/response"

export interface HealthCheckResult {
  service: string
  status: "up" | "down" | "starting" | "degraded"
  lastChecked: string
  error?: string
  uptime?: number
  responseTime?: number
}

export interface HealthCheckResponse {
  services: HealthCheckResult[]
  timestamp: string
}

export async function handleHealthCheck(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams
  const service = searchParams.get("service")

  try {
    const checker = getHealthChecker()

    if (service) {
      const health = await checker.check(service)
      return ok<HealthCheckResult>({
        service: health.service,
        status: health.status,
        lastChecked: health.lastChecked.toISOString(),
        error: health.error,
        uptime: health.uptime,
        responseTime: health.responseTime,
      })
    }

    const allHealth = await checker.checkAll()
    const healthArray = Array.from(allHealth.values())

    const response: HealthCheckResponse = {
      services: healthArray.map(h => ({
        service: h.service,
        status: h.status,
        lastChecked: h.lastChecked.toISOString(),
        error: h.error,
        uptime: h.uptime,
        responseTime: h.responseTime,
      })),
      timestamp: new Date().toISOString(),
    }

    return ok(response)
  } catch (err) {
    console.error("[API] Failed to check health:", err)
    return error("Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleHealthCheck(request)
}
