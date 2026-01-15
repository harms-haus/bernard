import { NextResponse } from 'next/server'
import { ok } from './response'

export function handleOkCheck() {
  return ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "bernard-core",
    version: process.env.npm_package_version || "0.0.1",
  })
}
