import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth/helpers'
import { getSettingsStore } from '../../../../lib/api/factory'
import { ServicesSettingsSchema } from '../../../../lib/config/settingsStore'
import { error, ok, badRequest } from '../../../../lib/api/response'

async function handleGetServicesSettings(request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const store = getSettingsStore()
  const services = await store.getServices()
  return ok(services)
}

async function handlePutServicesSettings(
  request: NextRequest
): Promise<NextResponse> {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

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

export async function GET(request: NextRequest) {
  return handleGetServicesSettings(request)
}

export async function PUT(request: NextRequest) {
  return handlePutServicesSettings(request)
}
