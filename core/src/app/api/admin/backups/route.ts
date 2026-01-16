import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { SettingsStore, BackupSettingsSchema } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const backups = await store.getBackups()
  return NextResponse.json(backups || {})
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const parsed = BackupSettingsSchema.parse(body)
  await store.setBackups(parsed)
  return NextResponse.json(parsed)
}
