import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth } from '@/lib/auth/helpers'
import { SettingsStore, OAuthSettingsSchema } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const oauth = await store.getOAuth()
  return NextResponse.json(oauth)
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const body = await request.json()
  const parsed = OAuthSettingsSchema.parse(body)
  await store.setOAuth(parsed)
  return NextResponse.json(parsed)
}
