import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { BackupSettingsSchema, getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore'
import { getRedis } from '@/lib/infra/redis'

let initialized = false;

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis());
    initialized = true;
  }
  return getSettingsStore();
}

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const store = await getStore();
  const backups = await store.getBackups()
  return NextResponse.json(backups || {})
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const parsed = BackupSettingsSchema.parse(body)
  const store = await getStore();
  await store.setBackups(parsed)
  return NextResponse.json(parsed)
}
