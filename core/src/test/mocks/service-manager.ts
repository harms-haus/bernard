import { vi } from 'vitest'

export function createMockServiceManager() {
  return {
    getStatus: vi.fn((_serviceId: string) => 
      Promise.resolve({
        id: 'test',
        name: 'TEST',
        status: 'running' as const,
        health: { status: 'up' as const, service: 'test', lastChecked: new Date() },
        color: 'green',
      })
    ),
    getAllStatus: vi.fn(() => Promise.resolve([])),
    healthCheck: vi.fn((_serviceId: string) => 
      Promise.resolve({
        service: 'test',
        status: 'up' as const,
        lastChecked: new Date(),
      })
    ),
    healthCheckAll: vi.fn(() => Promise.resolve(new Map())),
    getUptime: vi.fn(() => Promise.resolve(null)),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    restart: vi.fn(() => Promise.resolve()),
  }
}

export type MockServiceManager = ReturnType<typeof createMockServiceManager>
