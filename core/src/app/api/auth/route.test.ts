import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { getCurrentUser, setSessionCookie, clearSessionCookie } from '@/lib/auth/session'
import { getOAuthConfig, createOAuthState, validateOAuthState, exchangeCodeForToken, fetchUserInfo, createOAuthSession } from '@/lib/auth/oauth'

vi.mock('../../../lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}))

vi.mock('../../../lib/auth/oauth', () => ({
  getOAuthConfig: vi.fn(),
  createOAuthState: vi.fn(),
  validateOAuthState: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  fetchUserInfo: vi.fn(),
  createOAuthSession: vi.fn(),
}))

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockSetSessionCookie = vi.mocked(setSessionCookie)
const mockClearSessionCookie = vi.mocked(clearSessionCookie)
const mockGetOAuthConfig = vi.mocked(getOAuthConfig)
const mockCreateOAuthState = vi.mocked(createOAuthState)
const mockValidateOAuthState = vi.mocked(validateOAuthState)
const mockExchangeCodeForToken = vi.mocked(exchangeCodeForToken)
const mockFetchUserInfo = vi.mocked(fetchUserInfo)
const mockCreateOAuthSession = vi.mocked(createOAuthSession)

describe('GET /api/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (url: string, headers: Record<string, string> = {}) =>
    ({
      url,
      headers: new Headers(headers),
    }) as unknown as import('next/server').NextRequest

  describe('action=me', () => {
    it('should return user info for authenticated request', async () => {
      const mockUser = {
        user: {
          id: 'user-123',
          displayName: 'Test User',
          isAdmin: false,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          avatarUrl: 'https://example.com/avatar.png',
          email: 'test@example.com',
        },
        sessionId: 'session-123',
      }
      mockGetCurrentUser.mockResolvedValue(mockUser)

      const request = createMockRequest('http://localhost/api/auth?action=me')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.user.id).toBe('user-123')
      expect(data.user.displayName).toBe('Test User')
      expect(data.sessionId).toBe('session-123')
    })

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null)

      const request = createMockRequest('http://localhost/api/auth?action=me')
      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Not authenticated')
    })

    it('should return user info with authorization header', async () => {
      const mockUser = {
        user: {
          id: 'user-456',
          displayName: 'Admin User',
          isAdmin: true,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          avatarUrl: undefined,
          email: 'admin@example.com',
        },
        sessionId: 'session-456',
      }
      mockGetCurrentUser.mockResolvedValue(mockUser)

      const request = createMockRequest('http://localhost/api/auth?action=me', { authorization: 'Bearer token-123' })
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(mockGetCurrentUser).toHaveBeenCalledWith('Bearer token-123')
    })
  })

  describe('action=admin', () => {
    it('should return admin info for admin user', async () => {
      const mockAdmin = {
        user: {
          id: 'admin-123',
          displayName: 'Admin',
          isAdmin: true,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session-admin',
      }
      mockGetCurrentUser.mockResolvedValue(mockAdmin)

      const request = createMockRequest('http://localhost/api/auth?action=admin')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.user.id).toBe('admin-123')
      expect(data.user.isAdmin).toBe(true)
    })

    it('should return 403 for non-admin user', async () => {
      const mockUser = {
        user: {
          id: 'user-123',
          displayName: 'Regular User',
          isAdmin: false,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session-123',
      }
      mockGetCurrentUser.mockResolvedValue(mockUser)

      const request = createMockRequest('http://localhost/api/auth?action=admin')
      const response = await GET(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Admin access required')
    })

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null)

      const request = createMockRequest('http://localhost/api/auth?action=admin')
      const response = await GET(request)

      expect(response.status).toBe(401)
    })
  })

  describe('action=login', () => {
    it('should redirect to GitHub OAuth URL', async () => {
      mockGetOAuthConfig.mockResolvedValue({
        authUrl: 'https://github.com/login/oauth/authorize',
        clientId: 'test-client-id',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'read:user user:email',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        clientSecret: 'secret',
      })
      mockCreateOAuthState.mockResolvedValue('test-state-123')

      const request = createMockRequest('http://localhost/api/auth?action=login&provider=github')
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toContain('github.com/login/oauth/authorize')
      expect(location).toContain('client_id=test-client-id')
      expect(location).toContain('state=test-state-123')
    })

    it('should redirect to Google OAuth URL', async () => {
      mockGetOAuthConfig.mockResolvedValue({
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: 'google-client-id',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'openid email profile',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        clientSecret: 'secret',
      })
      mockCreateOAuthState.mockResolvedValue('google-state-456')

      const request = createMockRequest('http://localhost/api/auth?action=login&provider=google')
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toContain('accounts.google.com')
    })

    it('should return 400 for invalid provider', async () => {
      const request = createMockRequest('http://localhost/api/auth?action=login&provider=invalid')
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid provider')
    })

    it('should use default returnTo when not provided', async () => {
      mockGetOAuthConfig.mockResolvedValue({
        authUrl: 'https://github.com/login/oauth/authorize',
        clientId: 'client-id',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'read:user',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        clientSecret: 'secret',
      })
      mockCreateOAuthState.mockResolvedValue('state')

      const request = createMockRequest('http://localhost/api/auth?action=login&provider=github')
      const response = await GET(request)

      expect(mockCreateOAuthState).toHaveBeenCalledWith('github', '/status')
    })

    it('should use custom returnTo when provided', async () => {
      mockGetOAuthConfig.mockResolvedValue({
        authUrl: 'https://github.com/login/oauth/authorize',
        clientId: 'client-id',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'read:user',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        clientSecret: 'secret',
      })
      mockCreateOAuthState.mockResolvedValue('state')

      const request = createMockRequest('http://localhost/api/auth?action=login&provider=github&returnTo=/dashboard')
      const response = await GET(request)

      expect(mockCreateOAuthState).toHaveBeenCalledWith('github', '/dashboard')
    })

    it('should return 500 when getOAuthConfig throws', async () => {
      mockGetOAuthConfig.mockRejectedValue(new Error('Config error'))

      const request = createMockRequest('http://localhost/api/auth?action=login&provider=github')
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to initiate login')
    })
  })

  describe('action=admin-login', () => {
    it('should set admin session cookie with valid key', async () => {
      const originalEnv = process.env.ADMIN_API_KEY
      process.env.ADMIN_API_KEY = 'secret-admin-key'

      const request = createMockRequest('http://localhost/api/auth?action=admin-login&key=secret-admin-key&returnTo=/admin')
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/admin')
      expect(response.cookies.get('bernard_admin_session')).toBeDefined()

      process.env.ADMIN_API_KEY = originalEnv
    })

    it('should return 400 when key is missing', async () => {
      const request = createMockRequest('http://localhost/api/auth?action=admin-login')
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Missing key parameter')
    })

    it('should return 401 for invalid key', async () => {
      const originalEnv = process.env.ADMIN_API_KEY
      process.env.ADMIN_API_KEY = 'secret-admin-key'

      const request = createMockRequest('http://localhost/api/auth?action=admin-login&key=wrong-key')
      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Invalid admin key')

      process.env.ADMIN_API_KEY = originalEnv
    })

    it('should return 400 for invalid returnTo', async () => {
      const originalEnv = process.env.ADMIN_API_KEY
      process.env.ADMIN_API_KEY = 'secret-admin-key'

      const request = createMockRequest('http://localhost/api/auth?action=admin-login&key=secret-admin-key&returnTo=http://evil.com')
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid returnTo parameter')

      process.env.ADMIN_API_KEY = originalEnv
    })
  })

  describe('action=validate', () => {
    it('should validate token and return user info', async () => {
      const mockUser = {
        user: {
          id: 'user-123',
          displayName: 'Test User',
          isAdmin: false,
          status: 'active' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session-123',
      }
      mockGetCurrentUser.mockResolvedValue(mockUser)

      const request = createMockRequest('http://localhost/api/auth?action=validate')
      vi.spyOn(request, 'json').mockResolvedValue({ token: 'valid-token' })

      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.valid).toBe(true)
      expect(data.user.id).toBe('user-123')
    })

    it('should return 400 when token is missing', async () => {
      const request = createMockRequest('http://localhost/api/auth?action=validate')
      vi.spyOn(request, 'json').mockResolvedValue({})

      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Token required')
    })

    it('should return 401 for invalid token', async () => {
      mockGetCurrentUser.mockResolvedValue(null)

      const request = createMockRequest('http://localhost/api/auth?action=validate')
      vi.spyOn(request, 'json').mockResolvedValue({ token: 'invalid-token' })

      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Invalid token')
    })
  })

  describe('default action', () => {
    it('should return 400 for invalid action', async () => {
      const request = createMockRequest('http://localhost/api/auth?action=invalid')
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid action')
    })
  })
})

describe('POST /api/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('action=logout', () => {
    it('should clear session and return success', async () => {
      const request = {
        url: 'http://localhost/api/auth?action=logout',
      } as import('next/server').NextRequest

      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(mockClearSessionCookie).toHaveBeenCalled()
    })
  })

  describe('default action', () => {
    it('should return 400 for invalid action', async () => {
      const request = {
        url: 'http://localhost/api/auth?action=invalid',
      } as import('next/server').NextRequest

      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid action')
    })
  })
})
