import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleMe } from './route'

// Mock session dependencies
vi.mock('../../../../lib/auth/session', () => ({
  getSessionFromHeader: vi.fn(),
}))

// Re-import to get the mocked version
const { getSessionFromHeader }: any = await import('../../../../lib/auth/session')

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (authHeader: string | null) =>
    ({
      headers: {
        get: (name: string) => (name === 'authorization' ? authHeader : null),
      },
    } as unknown as import('next/server').NextRequest)

  describe('handleMe', () => {
    it('should return user data for authenticated request', async () => {
      getSessionFromHeader.mockResolvedValue({
        user: {
          id: 'user-123',
          displayName: 'Test User',
          isAdmin: false,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          avatarUrl: 'https://example.com/avatar.png',
          email: 'test@example.com',
        },
        sessionId: 'session-456',
      })

      const request = createMockRequest('Bearer token-123')
      const result = await handleMe(request)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.user.id).toBe('user-123')
      expect(data.data.user.displayName).toBe('Test User')
      expect(data.data.user.isAdmin).toBe(false)
      expect(data.data.user.status).toBe('active')
      expect(data.data.user.email).toBe('test@example.com')
      expect(data.data.sessionId).toBe('session-456')
    })

    it('should return admin user data correctly', async () => {
      getSessionFromHeader.mockResolvedValue({
        user: {
          id: 'admin-789',
          displayName: 'Admin User',
          isAdmin: true,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        sessionId: 'admin-session',
      })

      const request = createMockRequest('Bearer admin-token')
      const result = await handleMe(request)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.data.user.isAdmin).toBe(true)
    })

    it('should return 401 when no authorization header', async () => {
      getSessionFromHeader.mockResolvedValue(null)

      const request = createMockRequest(null)
      const result = await handleMe(request)

      expect(result.status).toBe(401)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Not authenticated')
    })

    it('should return 401 for invalid authorization header format', async () => {
      getSessionFromHeader.mockResolvedValue(null)

      const request = createMockRequest('InvalidFormat')
      const result = await handleMe(request)

      expect(result.status).toBe(401)
    })

    it('should return 401 when session returns null', async () => {
      getSessionFromHeader.mockResolvedValue(null)

      const request = createMockRequest('Bearer valid-token')
      const result = await handleMe(request)

      expect(result.status).toBe(401)
    })

    it('should not include undefined optional fields', async () => {
      getSessionFromHeader.mockResolvedValue({
        user: {
          id: 'user-no-optional',
          displayName: 'No Optional User',
          isAdmin: false,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        sessionId: 'session-no-optional',
      })

      const request = createMockRequest('Bearer token')
      const result = await handleMe(request)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.data.user.avatarUrl).toBeUndefined()
      expect(data.data.user.email).toBeUndefined()
    })
  })
})
