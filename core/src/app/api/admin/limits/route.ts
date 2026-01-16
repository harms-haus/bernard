import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { SettingsStore, LimitsSettingsSchema } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const limits = await store.getLimits()
  return NextResponse.json(limits)
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const parsed = LimitsSettingsSchema.parse(body)
  await store.setLimits(parsed)
  return NextResponse.json(parsed)
}
