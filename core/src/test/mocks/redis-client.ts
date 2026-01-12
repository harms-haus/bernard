/**
 * Pre-configured Redis mock for testing
 */

import { vi } from 'vitest'

let isConnected = false

export const redisClientMock = {
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

// Reset for each test
export function resetRedisMock() {
  isConnected = false
  redisClientMock.connect.mockClear()
  redisClientMock.quit.mockClear()
  redisClientMock.ping.mockClear()
  redisClientMock.scan.mockClear()
  redisClientMock.json.set.mockClear()
  redisClientMock.json.get.mockClear()
  redisClientMock.keys.mockClear()
  redisClientMock.expire.mockClear()
  redisClientMock.del.mockClear()
}
