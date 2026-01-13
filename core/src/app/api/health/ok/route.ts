import { NextResponse } from "next/server"
import { ok } from "@/lib/api/response"

export function handleOkCheck() {
  return ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "bernard-core",
    version: process.env.npm_package_version || "0.0.1",
  })
}

export async function GET() {
  return handleOkCheck()
}
