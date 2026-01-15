import { NextRequest, NextResponse } from 'next/server'
import { SERVICES } from '@/lib/services/ServiceConfig'
import { getServiceManager } from '@/lib/api/factory'
import { addServiceJob } from '@/lib/infra/service-queue'
import type { ServiceAction } from '@/lib/infra/service-queue/types'
import { error, ok, notFound, badRequest } from './response'

export interface ServiceStatusResponse {
  config: (typeof SERVICES)[keyof typeof SERVICES]
  status: Awaited<ReturnType<ReturnType<typeof getServiceManager>['getStatus']>>
  health: Awaited<ReturnType<ReturnType<typeof getServiceManager>['healthCheck']>>
}

export interface ServiceCommandBody {
  command?: unknown
}

export interface ServiceCommandResponse {
  service: string
  command: string
  jobId: string
  status: string
  message: string
}

export async function handleGetService(serviceId: string): Promise<NextResponse> {
  const config = SERVICES[serviceId]

  if (!config) {
    return notFound("Service not found")
  }

  const manager = getServiceManager()

  try {
    const [status, health] = await Promise.all([
      manager.getStatus(serviceId),
      manager.healthCheck(serviceId),
    ])

    return ok({ config, status, health })
  } catch {
    return error("Failed to get service status", 500)
  }
}

export async function handleServiceCommand(
  serviceId: string,
  body: ServiceCommandBody
): Promise<NextResponse> {
  const config = SERVICES[serviceId]

  if (!config) {
    return notFound("Service not found")
  }

  const { command } = body

  if (!command || !['start', 'stop', 'restart'].includes(command as string)) {
    return badRequest("Invalid command. Use: start, stop, or restart")
  }

  try {
    const jobId = await addServiceJob(
      serviceId,
      command as ServiceAction,
      { initiatedBy: 'api' }
    )

    return ok<ServiceCommandResponse>({
      service: serviceId,
      command: command as string,
      jobId,
      status: 'queued',
      message: 'Action queued for execution',
    })
  } catch {
    return error("Failed to queue action", 500)
  }
}
