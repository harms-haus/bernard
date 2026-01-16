import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { OAuthSettingsSchema, getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore'

let initialized = false;

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore();
    initialized = true;
  }
  return getSettingsStore();
}

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const store = await getStore();
  const oauth = await store.getOAuth()
  return NextResponse.json(oauth)
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const parsed = OAuthSettingsSchema.parse(body)
  const store = await getStore();
  await store.setOAuth(parsed)
  return NextResponse.json(parsed)
}
