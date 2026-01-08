import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    service: "bernard-core",
    routes: [
      "GET /api/health - Health check for all services",
      "GET /api/services - List all services with status",
      "GET /api/services/:id - Get service details",
      "POST /api/services/:id - Execute command (start, stop, restart, check)",
      "GET /api/logs/stream - SSE stream for logs",
      "GET /api/v1/* - OpenAI-compatible proxy",
    ],
  })
}
