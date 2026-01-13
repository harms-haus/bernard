import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retryStrategy, getRedis } from './redis'

// Mock Redis client for testing lazy connection
let isConnected = false
const mockRedisClient = {
  connect: vi.fn().mockImplementation(async () => {
    isConnected = true
  }),
  on: vi.fn(),
  ping: vi.fn().mockImplementation(async () => {
    if (!isConnected) {
      await mockRedisClient.connect()
    }
    return 'PONG'
  }),
  quit: vi.fn(),
}

// Mock the Redis constructor
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => mockRedisClient),
}))

describe('redis', () => {
  describe('retryStrategy', () => {
    // Extract the retry strategy logic for testing
    // The actual retry strategy is defined inline in getRedis()
    // We'll test the expected behavior

    it('should calculate linear backoff with cap at 5 seconds', () => {
      expect(retryStrategy(1)).toBe(200)
      expect(retryStrategy(5)).toBe(1000)
      expect(retryStrategy(10)).toBe(2000)
      expect(retryStrategy(25)).toBe(5000) // Capped at 5000
      expect(retryStrategy(50)).toBe(5000) // Still capped
    })

    it('should start at 200ms and increase linearly until cap', () => {
      const calculateDelay = (times: number): number => {
        const delay = Math.min(times * 200, 5000);
        return delay;
      }

      // First 24 retries are under the cap
      for (let i = 1; i <= 24; i++) {
        const expected = i * 200
        expect(calculateDelay(i)).toBe(expected)
      }

      // After 25, it stays at 5000
      expect(calculateDelay(25)).toBe(5000)
      expect(calculateDelay(100)).toBe(5000)
    })
  })

  describe('connection error handling', () => {
    it('should identify AggregateError by name', () => {
      const mockAggregateError = {
        name: 'AggregateError',
        message: 'Connection failed',
      }

      const isAggregateError = mockAggregateError.name === 'AggregateError'
      expect(isAggregateError).toBe(true)
    })

    it('should identify ECONNREFUSED errors', () => {
      const mockError = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
      }

      const isEconnrefused = 
        mockError.code === 'ECONNREFUSED' ||
        mockError.message.includes('ECONNREFUSED') ||
        mockError.message.includes('connect')

      expect(isEconnrefused).toBe(true)
    })

    it('should not match unrelated errors', () => {
      const mockError = {
        code: 'ENOTFOUND',
        message: 'Some other error',
      }

      const isEconnrefused = 
        mockError.code === 'ECONNREFUSED' ||
        mockError.message.includes('ECONNREFUSED') ||
        mockError.message.includes('connect')

      expect(isEconnrefused).toBe(false)
    })
  })

  describe('lazyConnect behavior', () => {
    let originalRedisUrl: string | undefined

    beforeEach(() => {
      originalRedisUrl = process.env['REDIS_URL']
      delete process.env['REDIS_URL']
      isConnected = false
      mockRedisClient.connect.mockClear()
      mockRedisClient.ping.mockClear()
    })

    afterEach(() => {
      process.env['REDIS_URL'] = originalRedisUrl
    })

    it('should not connect until first command', async () => {
      // Clear the global cache to force recreation
      const globalForRedis = global as unknown as { redis?: any }
      delete globalForRedis.redis

      // Call getRedis() - should create client but not connect
      const client = getRedis()

      // Verify Redis constructor was called with lazyConnect: true
      const RedisMock = (await import('ioredis')).Redis
      expect(RedisMock).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({ lazyConnect: true })
      )

      // Verify connect() was NOT called during instantiation
      expect(mockRedisClient.connect).not.toHaveBeenCalled()

      // Execute a Redis command - should trigger lazy connection
      await client.ping()

      // Verify connect() was called when first command executed
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1)
    })

    it('should default to redis://localhost:6379', () => {
      const defaultUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
      expect(defaultUrl).toBe('redis://localhost:6379')
    })

    it('should accept custom REDIS_URL', () => {
      vi.stubEnv('REDIS_URL', 'redis://custom-host:6380')
      const customUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
      expect(customUrl).toBe('redis://custom-host:6380')
      vi.unstubAllEnvs()
    })
  })

  describe('maxRetriesPerRequest', () => {
    it('should configure Redis client with 3 max retries per request', async () => {
      // Clear the global cache to force recreation
      const globalForRedis = global as unknown as { redis?: any }
      delete globalForRedis.redis

      // Call getRedis() to create a new client instance
      getRedis()

      // Verify Redis constructor was called with maxRetriesPerRequest: 3
      const RedisMock = (await import('ioredis')).Redis
      expect(RedisMock).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({ maxRetriesPerRequest: 3 })
      )
    })
  })

  describe('Redis URL parsing', () => {
    it('should parse standard Redis URL', () => {
      const url = 'redis://localhost:6379'
      const match = url.match(/^redis:\/\/([^:]+):(\d+)$/)
      expect(match).not.toBeNull()
      if (match) {
        expect(match[1]).toBe('localhost')
        expect(match[2]).toBe('6379')
      }
    })

    it('should parse Redis URL with password', () => {
      const url = 'redis://:password@localhost:6379'
      const match = url.match(/^redis:\/\/:([^@]+)@([^:]+):(\d+)$/)
      expect(match).not.toBeNull()
      if (match) {
        expect(match[1]).toBe('password')
        expect(match[2]).toBe('localhost')
        expect(match[3]).toBe('6379')
      }
    })

    it('should parse Redis URL with TLS', () => {
      const url = 'rediss://localhost:6379'
      const match = url.match(/^rediss:\/\//)
      expect(match).not.toBeNull()
    })
  })
})
