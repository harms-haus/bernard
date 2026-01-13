import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserStore } from './userStore'

// Simple mock Redis client with chainable transaction
function createMockRedis() {
  const mockMulti = {
    hset: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }

  return {
    multi: vi.fn().mockReturnValue(mockMulti),
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn(),
    hdel: vi.fn(),
    hmget: vi.fn().mockResolvedValue([]),
    sadd: vi.fn(),
    srem: vi.fn(),
    scard: vi.fn().mockResolvedValue(0),
    smembers: vi.fn().mockResolvedValue([]),
  }
}

describe('UserStore', () => {
  let store: UserStore
  let mockRedis: ReturnType<typeof createMockRedis>

  beforeEach(() => {
    mockRedis = createMockRedis()
    store = new UserStore(mockRedis as any)
  })

  describe('create', () => {
    it('should create user with ID', async () => {
      const user = await store.create({
        id: 'user-123',
        displayName: 'Test User',
        isAdmin: false,
      })

      expect(user.id).toBe('user-123')
      expect(user.displayName).toBe('Test User')
      expect(user.isAdmin).toBe(false)
      expect(user.status).toBe('active')
    })

    it('should call multi for transaction', async () => {
      await store.create({
        id: 'user-123',
        displayName: 'Test User',
        isAdmin: false,
      })

      expect(mockRedis.multi).toHaveBeenCalled()
    })
  })

  describe('get', () => {
    it('should return null for non-existent user', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({})
      const user = await store.get('non-existent')

      expect(user).toBeNull()
    })

    it('should return user for valid ID', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        id: 'user-123',
        displayName: 'Test User',
        isAdmin: 'false',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const user = await store.get('user-123')

      expect(user).toBeDefined()
      expect(user!.id).toBe('user-123')
      expect(user!.displayName).toBe('Test User')
    })
  })

  describe('list', () => {
    it('should return empty array when no users', async () => {
      mockRedis.smembers.mockResolvedValueOnce([])

      const users = await store.list()

      expect(users).toEqual([])
    })
  })

  describe('update', () => {
    it('should return null for non-existent user', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({})

      const result = await store.update('non-existent', { displayName: 'New Name' })

      expect(result).toBeNull()
    })
  })

  describe('delete', () => {
    it('should return null for non-existent user', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({})

      const result = await store.delete('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('exportAll', () => {
    it('should delegate to list', async () => {
      mockRedis.smembers.mockResolvedValueOnce([])

      const users = await store.exportAll()

      expect(users).toEqual([])
    })
  })
})
