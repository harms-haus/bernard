/**
 * Service factory for dependency injection in tests
 */

import { ServiceManager } from '../services/ServiceManager'
import { HealthChecker } from '../services/HealthChecker'
import { TaskRecordKeeper } from '../infra/taskKeeper'
import { getRedis } from '../infra/redis'
import { SettingsStore } from '../config/settingsStore'

// Interface for dependency injection in tests
export interface ApiServices {
  createServiceManager: () => ServiceManager
  createHealthChecker: () => HealthChecker
  createTaskKeeper: () => TaskRecordKeeper
  getSettingsStore: () => SettingsStore
}

// Default implementation - uses real services
const defaultServices: ApiServices = {
  createServiceManager: () => new ServiceManager(),
  createHealthChecker: () => new HealthChecker(),
  createTaskKeeper: () => new TaskRecordKeeper(getRedis()),
  getSettingsStore: () => new SettingsStore(),
}

// Global reference for overriding in tests
let apiServices: ApiServices = defaultServices

/**
 * Set the API services implementation (for testing)
 */
export function setApiServices(services: ApiServices): void {
  apiServices = services
}

/**
 * Reset API services to default implementation
 */
export function resetApiServices(): void {
  apiServices = defaultServices
}

/**
 * Get the current API services implementation
 */
export function getApiServices(): ApiServices {
  return apiServices
}

/**
 * Get a ServiceManager instance
 */
export function getServiceManager(): ServiceManager {
  return apiServices.createServiceManager()
}

/**
 * Get a HealthChecker instance
 */
export function getHealthChecker(): HealthChecker {
  return apiServices.createHealthChecker()
}

/**
 * Get a TaskRecordKeeper instance
 */
export function getTaskKeeper(): TaskRecordKeeper {
  return apiServices.createTaskKeeper()
}

/**
 * Get a SettingsStore instance
 */
export function getSettingsStore(): SettingsStore {
  return apiServices.getSettingsStore()
}
