import { NextResponse } from "next/server"
import { ok } from "@/lib/api/response"

function handleReadyCheck() {
  return ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "bernard-core",
  })
}

export async function GET() {
  return handleReadyCheck()
}
