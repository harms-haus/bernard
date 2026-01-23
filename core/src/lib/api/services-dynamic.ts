import { SERVICES } from '@/lib/services/ServiceConfig'
import { getServiceManager } from '@/lib/api/factory'
import { addJob } from '@/lib/infra/worker-queue'
import type { ServiceActionJobData } from '@/lib/infra/worker-queue'
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

export async function handleGetService(serviceId: string) {
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
) {
  const config = SERVICES[serviceId]

  if (!config) {
    return notFound("Service not found")
  }

  const { command } = body

  if (!command || !['start', 'stop', 'restart'].includes(command as string)) {
    return badRequest("Invalid command. Use: start, stop, or restart")
  }

  try {
    const jobData: ServiceActionJobData = {
      serviceId,
      action: command as 'start' | 'stop' | 'restart',
      initiatedBy: 'api',
    }
    const jobId = await addJob(`service:${command}`, jobData)

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
