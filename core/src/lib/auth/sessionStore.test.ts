import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionStore } from './sessionStore'

// Simple mock Redis client with chainable transaction
function createMockRedis() {
  const mockMulti = {
    hset: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }

  return {
    multi: vi.fn().mockReturnValue(mockMulti),
    hgetall: vi.fn().mockResolvedValue({}),
    hget: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    keys: vi.fn().mockResolvedValue([]),
  }
}

describe('SessionStore', () => {
  let store: SessionStore
  let mockRedis: ReturnType<typeof createMockRedis>

  beforeEach(() => {
    mockRedis = createMockRedis()
    store = new SessionStore(mockRedis as any)
  })

  describe('create', () => {
    it('should create session with generated ID', async () => {
      const session = await store.create('user-123')

      expect(session.id).toBeDefined()
      expect(session.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
      expect(session.userId).toBe('user-123')
      expect(session.createdAt).toBeDefined()
      expect(session.expiresAt).toBeDefined()
    })

    it('should create session with metadata', async () => {
      const session = await store.create('user-123', {
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
      })

      expect(session.userAgent).toBe('Mozilla/5.0')
      expect(session.ipAddress).toBe('127.0.0.1')
    })

    it('should call multi for transaction', async () => {
      await store.create('user-123')

      expect(mockRedis.multi).toHaveBeenCalled()
    })
  })

  describe('get', () => {
    it('should return null for non-existent session', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({})
      const session = await store.get('non-existent')

      expect(session).toBeNull()
    })

    it('should return session for valid ID', async () => {
      const session = await store.create('user-123')
      mockRedis.hgetall.mockResolvedValueOnce({
        id: session.id,
        userId: 'user-123',
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })

      const result = await store.get(session.id)

      expect(result).toBeDefined()
      expect(result!.id).toBe(session.id)
    })
  })

  describe('delete', () => {
    it('should delete session', async () => {
      const session = await store.create('user-123')
      mockRedis.hget.mockResolvedValueOnce('user-123')

      await store.delete(session.id)

      expect(mockRedis.multi).toHaveBeenCalled()
    })
  })

  describe('listAll', () => {
    it('should return empty array when no sessions', async () => {
      mockRedis.keys.mockResolvedValueOnce([])

      const sessions = await store.listAll()

      expect(sessions).toEqual([])
    })
  })

  describe('exportAll', () => {
    it('should delegate to listAll', async () => {
      mockRedis.keys.mockResolvedValueOnce([])

      const sessions = await store.exportAll()

      expect(sessions).toEqual([])
    })
  })
})
