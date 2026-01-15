import { NextRequest, NextResponse } from 'next/server'
import { getServiceManager } from './factory'
import { error, ok } from './response'
import type { ServiceStatus } from '../services/ServiceManager'

export async function handleGetServices(_request: NextRequest): Promise<NextResponse> {
  try {
    const manager = getServiceManager()
    const statuses = await manager.getAllStatus()
    return ok(statuses)
  } catch {
    return error("Failed to get service status", 500)
  }
}
