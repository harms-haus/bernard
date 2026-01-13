import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth/helpers'
import { SERVICES } from '../../../../lib/services/ServiceConfig'
import { ok, error, badRequest, forbidden } from '../../../../lib/api/response'

export interface ServiceInfo {
  id: string
  name: string
  displayName: string
  type: 'docker' | 'node' | 'python' | 'cpp'
  port?: number
  available: boolean
}

export interface ServiceListResponse {
  services: ServiceInfo[]
}

export interface ServiceManageBody {
  service?: unknown
  action?: string
}

export async function handleListServices(request: NextRequest): Promise<NextResponse> {
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

  return ok<ServiceListResponse>({ services })
}

export async function handleManageService(
  request: NextRequest,
  body: ServiceManageBody
): Promise<NextResponse> {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const { service: serviceId, action = 'restart' } = body

  // Validate action against allowlist
  const allowedActions = ['restart', 'stop', 'start']
  if (!allowedActions.includes(action)) {
    return badRequest(
      `Invalid action '${action}' for service '${serviceId || 'unknown'}'. Allowed actions: ${allowedActions.join(', ')}`,
      { allowedActions, requestedAction: action, serviceId }
    )
  }

  if (!serviceId || typeof serviceId !== 'string') {
    return badRequest('Service name is required', { availableServices: Object.keys(SERVICES) })
  }

  const serviceConfig = SERVICES[serviceId]
  if (!serviceConfig) {
    return badRequest('Invalid service name', { availableServices: Object.keys(SERVICES) })
  }

  if (serviceConfig.type === 'docker') {
    return forbidden('Cannot restart docker services via API')
  }

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
