import { vi } from 'vitest'

export function createMockHealthChecker() {
  return {
    check: vi.fn((_serviceId: string) => 
      Promise.resolve({
        service: 'test',
        status: 'up' as const,
        lastChecked: new Date(),
      })
    ),
    checkAll: vi.fn(() => Promise.resolve(new Map())),
    waitForHealthy: vi.fn(() => Promise.resolve(true)),
  }
}

export type MockHealthChecker = ReturnType<typeof createMockHealthChecker>
