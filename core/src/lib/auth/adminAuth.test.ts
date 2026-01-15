import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAdminUser, type AuthenticatedUser } from './adminAuth'

describe('adminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getAdminUser', () => {
    it('should return null when adminKey is undefined', () => {
      const result = getAdminUser(undefined, 'some-token')
      expect(result).toBeNull()
    })

    it('should return null when adminKey is empty string', () => {
      const result = getAdminUser('', 'some-token')
      expect(result).toBeNull()
    })

    it('should return null when bearerToken is null', () => {
      const result = getAdminUser('valid-key', null)
      expect(result).toBeNull()
    })

    it('should return null when bearerToken does not match adminKey', () => {
      const result = getAdminUser('correct-key', 'wrong-token')
      expect(result).toBeNull()
    })

    it('should return authenticated user when token matches adminKey', () => {
      const adminKey = 'super-secret-admin-key'
      const result = getAdminUser(adminKey, adminKey)

      expect(result).not.toBeNull()
      expect(result?.user.id).toBe('admin-token')
      expect(result?.user.displayName).toBe('Admin Token')
      expect(result?.user.isAdmin).toBe(true)
      expect(result?.user.status).toBe('active')
      expect(result?.sessionId).toBeNull()
    })

    it('should return authenticated user with valid token', () => {
      const adminKey = 'admin-key-12345'
      const token = 'admin-key-12345'
      const result = getAdminUser(adminKey, token)

      expect(result).not.toBeNull()
      expect(result?.user.isAdmin).toBe(true)
    })

    it('should return null when tokens partially match', () => {
      const result = getAdminUser('admin-key', 'admin-key-extra')
      expect(result).toBeNull()
    })

    it('should have correct timestamp format', () => {
      const adminKey = 'test-key'
      const result = getAdminUser(adminKey, adminKey)

      expect(result?.user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
    })
  })
})
