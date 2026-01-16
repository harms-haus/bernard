import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { getSettingsStore, ServicesSettingsSchema } from '@/lib/config/settingsStore'
import { error, ok, badRequest } from '@/lib/api/response'

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return error("Admin required", 403)

  const store = getSettingsStore()
  const services = await store.getServices()
  return ok(services)
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return error("Admin required", 403)

  try {
    const body = await request.json()
    const parsed = ServicesSettingsSchema.safeParse(body)

    if (!parsed.success) {
      return badRequest(parsed.error.issues.map(i => i.message).join(', '))
    }

    const store = getSettingsStore()
    const saved = await store.setServices(parsed.data)
    return ok(saved)
  } catch {
    return error('Failed to save services settings', 500)
  }
}
