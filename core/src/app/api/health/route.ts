import { NextRequest, NextResponse } from "next/server"
import { HealthChecker } from "@/lib/services/HealthChecker"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const service = searchParams.get("service")

  const checker = new HealthChecker()

  try {
    if (service) {
      const health = await checker.check(service)
      return NextResponse.json(health)
    }

    const allHealth = await checker.checkAll()
    const healthArray = Array.from(allHealth.values())

    return NextResponse.json({
      services: healthArray,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[API] Failed to check health:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
