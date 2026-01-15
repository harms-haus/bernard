import { NextResponse } from 'next/server'
import { ok } from './response'

export function handleReadyCheck() {
  return ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "bernard-core",
  })
}
