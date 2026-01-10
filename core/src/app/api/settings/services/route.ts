import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth } from '@/lib/auth/helpers'
import { SettingsStore, ServicesSettingsSchema } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const services = await store.getServices()
  return NextResponse.json(services)
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const body = await request.json()
  const parsed = ServicesSettingsSchema.parse(body)
  const saved = await store.setServices(parsed)
  return NextResponse.json(saved)
}
