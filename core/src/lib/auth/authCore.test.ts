import { describe, it, expect, vi } from 'vitest'
import { buildStores, resolveSession, validateToken, validateRedirect, getAdminUser, type AuthStores } from './authCore'
import type { ApiTokenRecord } from './types'

function createMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    hgetall: vi.fn(),
    hset: vi.fn(),
    del: vi.fn(),
    smembers: vi.fn().mockResolvedValue([]),
    scard: vi.fn().mockResolvedValue(0),
    multi: vi.fn(() => ({
      hset: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      srem: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
  }
}

function createMockStores(): AuthStores {
  const redis = createMockRedis()
  return buildStores(redis as unknown as import('ioredis').Redis)
}

describe('authCore', () => {
  describe('buildStores', () => {
    it('should create all store instances', () => {
      const mockRedis = {} as import('ioredis').Redis
      const stores = buildStores(mockRedis)

      expect(stores.redis).toBe(mockRedis)
      expect(stores.sessionStore).toBeDefined()
      expect(stores.userStore).toBeDefined()
      expect(stores.tokenStore).toBeDefined()
    })
  })

  describe('resolveSession', () => {
    it('should return null for non-existent session', async () => {
      const stores = createMockStores()
      const result = await resolveSession('non-existent', stores)
      expect(result).toBeNull()
    })

    it('should return null for deleted user', async () => {
      const stores = createMockStores()

      vi.spyOn(stores.userStore, 'get').mockResolvedValue({
        id: 'user-1',
        displayName: 'Test User',
        isAdmin: false,
        status: 'deleted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      vi.spyOn(stores.sessionStore, 'get').mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      const result = await resolveSession('session-1', stores)
      expect(result).toBeNull()
    })
  })

  describe('getAdminUser', () => {
    it('should return null without admin key', () => {
      expect(getAdminUser(undefined, 'token' as string | null)).toBeNull()
    })

    it('should return null without bearer token', () => {
      expect(getAdminUser('admin-key', null as unknown as string | null)).toBeNull()
    })

    it('should return null for mismatched tokens', () => {
      expect(getAdminUser('admin-key', 'wrong-token' as string | null)).toBeNull()
    })

    it('should return admin user for matching tokens', () => {
      const result = getAdminUser('admin-key', 'admin-key' as string | null)
      expect(result).not.toBeNull()
      expect(result!.user.isAdmin).toBe(true)
      expect(result!.user.id).toBe('admin-token')
    })
  })

  describe('validateToken', () => {
    it('should return null for invalid token', async () => {
      const stores = createMockStores()
      vi.spyOn(stores.tokenStore, 'validate').mockResolvedValue(null)

      const result = await validateToken('invalid-token', stores)
      expect(result).toBeNull()
    })

    it('should return access grant for valid API token', async () => {
      const stores = createMockStores()
      const tokenRecord: ApiTokenRecord = { 
        id: '1', 
        name: 'test', 
        token: 'test-token', 
        status: 'active', 
        createdAt: new Date().toISOString() 
      }
      vi.spyOn(stores.tokenStore, 'validate').mockResolvedValue(tokenRecord)

      const result = await validateToken('test-token', stores)
      expect(result).not.toBeNull()
      expect(result!.source).toBe('api-token')
    })

    it('should return null if token validation fails and no session exists', async () => {
      const stores = createMockStores()
      vi.spyOn(stores.tokenStore, 'validate').mockResolvedValue(null)

      const result = await validateToken('unknown-token', stores)
      expect(result).toBeNull()
    })
  })

  describe('validateRedirect', () => {
    it('should return / for null/undefined', () => {
      expect(validateRedirect(null as unknown as string | undefined)).toBe('/')
      expect(validateRedirect(undefined as unknown as string | undefined)).toBe('/')
    })

    it('should return / for non-string', () => {
      expect(validateRedirect(123 as unknown as string)).toBe('/')
    })

    it('should return / for control characters', () => {
      expect(validateRedirect('/test\x00path')).toBe('/')
    })

    it('should return safe relative paths', () => {
      expect(validateRedirect('/')).toBe('/')
      expect(validateRedirect('/dashboard')).toBe('/dashboard')
      expect(validateRedirect('/path/to/page')).toBe('/path/to/page')
    })

    it('should return / for double-slash paths', () => {
      expect(validateRedirect('//evil.com')).toBe('/')
    })

    it('should allow http URLs', () => {
      expect(validateRedirect('http://example.com/path', ['example.com'])).toBe('http://example.com/path')
    })

    it('should allow https URLs', () => {
      expect(validateRedirect('https://example.com/path', ['example.com'])).toBe('https://example.com/path')
    })

    it('should block non-http protocols', () => {
      expect(validateRedirect('ftp://example.com')).toBe('/')
      expect(validateRedirect('javascript:alert(1)')).toBe('/')
    })

    it('should block external hosts without allowlist', () => {
      expect(validateRedirect('https://evil.com/path')).toBe('/')
    })

    it('should allow whitelisted hosts', () => {
      expect(validateRedirect('https://trusted.com/path', ['trusted.com'])).toBe('https://trusted.com/path')
    })

    it('should return / for invalid URLs', () => {
      expect(validateRedirect('not-a-url')).toBe('/')
    })
  })
})
