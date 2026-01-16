import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { getSettingsStore } from '@/lib/config/settingsStore'
import { error } from '@/lib/api/response'

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  try {
    const store = getSettingsStore()
    const settings = await store.getAll()
    return NextResponse.json(settings)
  } catch {
    return error('Failed to get settings', 500)
  }
}
