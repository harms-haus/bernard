import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../auth/server-helpers'
import { getSettingsStore } from './factory'
import { error, ok } from './response'

export async function handleGetSettings(_request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  try {
    const store = getSettingsStore()
    const settings = await store.getAll()
    return ok(settings)
  } catch {
    return error('Failed to get settings', 500)
  }
}
