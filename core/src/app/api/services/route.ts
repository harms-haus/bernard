import { NextRequest, NextResponse } from 'next/server'
import { getServiceManager } from '@/lib/api/factory'
import { ok, error } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/server-helpers'

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: 'Session required' }, { status: 403 })

    const manager = getServiceManager()
    const statuses = await manager.getAllStatus()
    return ok(statuses)
  } catch {
    return error("Failed to get service status", 500)
  }
}
