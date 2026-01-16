import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { SettingsStore, OAuthSettingsSchema } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const oauth = await store.getOAuth()
  return NextResponse.json(oauth)
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const parsed = OAuthSettingsSchema.parse(body)
  await store.setOAuth(parsed)
  return NextResponse.json(parsed)
}
