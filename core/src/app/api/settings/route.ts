import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth } from '@/lib/auth/helpers'
import { SettingsStore } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const settings = await store.getAll()
  return NextResponse.json(settings)
}
