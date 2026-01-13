export function mockServiceStatus(
  overrides: Partial<ServiceStatus> = {}
): ServiceStatus {
  const base: ServiceStatus = {
    id: 'core',
    name: 'Core API',
    status: 'running',
    uptime: 3600,
    health: {
      status: 'up',
      timestamp: new Date(),
    },
  }

  return {
    ...base,
    ...overrides,
    health: { ...base.health, ...overrides.health },
  };
}

export function mockServiceHealth(
  overrides: Partial<ServiceHealth> = {}
): ServiceHealth {
  const base: ServiceHealth = {
    status: 'up',
    timestamp: new Date(),
  }

  return { ...base, ...overrides }
}

interface ServiceStatus {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  uptime: number
  health: ServiceHealth
}

interface ServiceHealth {
  status: 'up' | 'down'
  timestamp: Date
}
