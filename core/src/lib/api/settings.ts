import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../auth/helpers'
import { getSettingsStore } from './factory'
import { error, ok } from './response'

export async function handleGetSettings(request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  try {
    const store = getSettingsStore()
    const settings = await store.getAll()
    return ok(settings)
  } catch {
    return error('Failed to get settings', 500)
  }
}
