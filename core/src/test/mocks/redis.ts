/**
 * Redis client mock factory for testing
 */

import { vi } from 'vitest'

export function createRedisMock() {
  let isConnected = false

  return {
    connect: vi.fn(async () => {
      isConnected = true
    }),
    quit: vi.fn(async () => {
      isConnected = false
    }),
    ping: vi.fn(async () => {
      if (!isConnected) {
        throw new Error('Connection is closed')
      }
      return 'PONG'
    }),
    get isOpen() {
      return isConnected
    },
    scan: vi.fn().mockResolvedValue({
      cursor: '0',
      keys: [],
    }),
    json: {
      set: vi.fn(),
      get: vi.fn(),
    },
    keys: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  }
}

export function createConnectedRedisMock() {
  const mock = createRedisMock()
  // Auto-connect by calling connect, then clear call history
  mock.connect()
  mock.connect.mockClear()
  return mock
}
