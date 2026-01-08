'use server'

import { revalidatePath } from 'next/cache'
import { ServiceManager } from '@/lib/services/ServiceManager'

export async function startService(serviceId: string) {
  const manager = new ServiceManager()
  const result = await manager.start(serviceId)
  revalidatePath('/status')
  revalidatePath(`/services/${serviceId}`)
  return result
}

export async function stopService(serviceId: string) {
  const manager = new ServiceManager()
  const result = await manager.stop(serviceId)
  revalidatePath('/status')
  revalidatePath(`/services/${serviceId}`)
  return result
}

export async function restartService(serviceId: string) {
  const manager = new ServiceManager()
  const result = await manager.restart(serviceId)
  revalidatePath('/status')
  revalidatePath(`/services/${serviceId}`)
  return result
}

export async function checkService(serviceId: string) {
  const manager = new ServiceManager()
  return manager.check(serviceId)
}

export async function getServiceStatus(serviceId: string) {
  const manager = new ServiceManager()
  return manager.getStatus(serviceId)
}

export async function getAllServiceStatuses() {
  const manager = new ServiceManager()
  return manager.getAllStatus()
}
