import type { ServiceId } from '@/lib/services/ServiceConfig'
import type { HealthStatus, HealthStatusType } from '@/lib/services/HealthChecker'

export function mockServiceStatus(overrides: Partial<HealthStatus> = {}): HealthStatus {
  return {
    service: 'core' as ServiceId,
    status: 'up' as HealthStatusType,
    lastChecked: new Date(),
    ...overrides,
  }
}

export function mockProcessInfo(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    pid: 12345,
    command: 'node',
    args: ['dev'],
    ...overrides,
  }
}

export function mockJobRecord(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'task-abc123',
    status: 'running',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}
