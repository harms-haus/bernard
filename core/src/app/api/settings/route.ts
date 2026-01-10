import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth } from '@/lib/auth/helpers'
import { SettingsStore, ModelsSettingsSchema, ServicesSettingsSchema, BackupSettingsSchema, OAuthSettingsSchema } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function GET(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  switch (type) {
    case 'models':
      const models = await store.getModels()
      return NextResponse.json(models)
    case 'services':
      const services = await store.getServices()
      return NextResponse.json(services)
    case 'backups':
      const backups = await store.getBackups()
      return NextResponse.json(backups)
    case 'oauth':
      const oauth = await store.getOAuth()
      return NextResponse.json(oauth)
    default:
      const settings = await store.getAll()
      return NextResponse.json(settings)
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  switch (type) {
    case 'models': {
      const body = await request.json()
      const parsed = ModelsSettingsSchema.parse(body)
      const saved = await store.setModels(parsed)
      return NextResponse.json(saved)
    }
    case 'services': {
      const body = await request.json()
      const parsed = ServicesSettingsSchema.parse(body)
      const saved = await store.setServices(parsed)
      return NextResponse.json(saved)
    }
    case 'backups': {
      const body = await request.json()
      const parsed = BackupSettingsSchema.parse(body)
      await store.setBackups(parsed)
      return NextResponse.json(parsed)
    }
    case 'oauth': {
      const body = await request.json()
      const parsed = OAuthSettingsSchema.parse(body)
      await store.setOAuth(parsed)
      return NextResponse.json(parsed)
    }
    default:
      return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  }
}
