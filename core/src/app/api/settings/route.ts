import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../lib/auth/helpers'
import { getSettingsStore } from '../../../lib/api/factory'
import { error, ok } from '../../../lib/api/response'

async function handleGetSettings(request: NextRequest): Promise<NextResponse> {
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

export async function GET(request: NextRequest) {
  return handleGetSettings(request)
}
