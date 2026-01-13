import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth } from '@/lib/auth/helpers'
import { SettingsStore, BackupSettingsSchema } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const backups = await store.getBackups()
  return NextResponse.json(backups || {})
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const body = await request.json()
  const parsed = BackupSettingsSchema.parse(body)
  await store.setBackups(parsed)
  return NextResponse.json(parsed)
}
