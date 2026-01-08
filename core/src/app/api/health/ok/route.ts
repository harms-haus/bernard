import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "bernard-core",
    version: process.env.npm_package_version || "0.0.1",
  })
}
