import { NextResponse } from "next/server"
import { ok } from "@/lib/api/response"

export function handleReadyCheck() {
  return ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "bernard-core",
  })
}

export async function GET() {
  return handleReadyCheck()
}
