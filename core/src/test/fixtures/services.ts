import { ServiceConfig } from '@/lib/services/ServiceConfig'

export function mockServiceConfig(
  overrides: Partial<ServiceConfig>
): ServiceConfig {
  const base: ServiceConfig = {
    id: 'test-service',
    name: 'Test Service',
    displayName: 'Test Service',
    type: 'node',
    port: 3000,
    directory: '/test/path',
    script: 'node',
    healthPath: '/health',
    dependencies: [],
    startupTimeout: 30,
    color: '#000000',
  }

  return { ...base, ...overrides }
}

export function mockServiceConfigs(): ServiceConfig[] {
  return [
    mockServiceConfig({
      id: 'redis',
      name: 'Redis',
      displayName: 'Redis',
      type: 'docker',
      port: 6379,
      container: 'redis',
      image: 'redis:7',
    }),
    mockServiceConfig({
      id: 'core',
      name: 'Core API',
      displayName: 'Core API',
      type: 'node',
      port: 3456,
      dependencies: ['redis'],
    }),
    mockServiceConfig({
      id: 'bernard-agent',
      name: 'Bernard Agent',
      displayName: 'Bernard Agent',
      type: 'node',
      port: 2024,
      dependencies: ['core'],
    }),
  ]
}
