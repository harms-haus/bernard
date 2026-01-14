import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth/helpers'
import { SERVICES } from '../../../../lib/services/ServiceConfig'
import { ok } from '../../../../lib/api/response'

interface ServiceInfo {
  id: string
  name: string
  displayName: string
  type: 'docker' | 'node' | 'python' | 'cpp'
  port?: number
  available: boolean
}

async function handleListServices(request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const services: ServiceInfo[] = Object.entries(SERVICES).map(([id, config]) => ({
    id,
    name: config.name,
    displayName: config.displayName,
    type: config.type,
    port: config.port,
    available: true,
  }))

  return ok<{ services: ServiceInfo[] }>({ services })
}

interface ServiceManageBody {
  service?: unknown
  action?: string
}

async function handleManageService(
  request: NextRequest,
  body: ServiceManageBody
): Promise<NextResponse> {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const { service: serviceId, action = 'restart' } = body

  // Validate action against allowlist
  const allowedActions = ['restart', 'stop', 'start']
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Allowed: ${allowedActions.join(', ')}` }, { status: 400 })
  }

  if (!serviceId || typeof serviceId !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid service ID' }, { status: 400 })
  }

  const serviceConfig = SERVICES[serviceId as keyof typeof SERVICES]
  if (!serviceConfig) {
    return NextResponse.json({ error: `Service "${serviceId}" not found` }, { status: 404 })
  }

  // Note: Actual service management is done via shell scripts or process manager
  // This endpoint just validates and returns a success message

  return ok({
    success: true,
    serviceId,
    action,
    message: `${action.charAt(0).toUpperCase() + action.slice(1)} initiated for ${serviceConfig.displayName}`,
    note: 'Use service scripts or process manager to execute this action',
  })
}

export async function GET(request: NextRequest) {
  return handleListServices(request)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handleManageService(request, body)
}
