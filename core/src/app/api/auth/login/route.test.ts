import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleLogin, validateLoginBody, validateReturnTo } from '@/lib/api/auth-login'

// Mock OAuth dependencies
vi.mock('../../../../lib/auth/oauth', () => ({
  getOAuthConfig: vi.fn(),
  createOAuthState: vi.fn(),
  initializeOAuth: vi.fn(),
  createOAuthDependencies: vi.fn(),
}))

// Re-import to get the mocked version
const { getOAuthConfig, createOAuthState }: any = await import('../../../../lib/auth/oauth')

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleLogin', () => {
    it('should return auth URL for valid GitHub provider', async () => {
      getOAuthConfig.mockResolvedValue({
        authUrl: 'https://github.com/login/oauth/authorize',
        clientId: 'test-client-id',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'read:user user:email',
      })
      createOAuthState.mockResolvedValue({ state: 'mock-state-123', codeChallenge: 'mock-challenge' })

      const result = await handleLogin({ provider: 'github', returnTo: '/status' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.authUrl).toContain('github.com/login/oauth/authorize')
      expect(data.data.authUrl).toContain('client_id=test-client-id')
      expect(data.data.authUrl).toContain('state=mock-state-123')
    })

    it('should return auth URL for valid Google provider', async () => {
      getOAuthConfig.mockResolvedValue({
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: 'google-client-id',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'openid email profile',
      })
      createOAuthState.mockResolvedValue('google-state-456')

      const result = await handleLogin({ provider: 'google', returnTo: '/dashboard' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.authUrl).toContain('accounts.google.com')
    })

    it('should return 400 for invalid provider', async () => {
      const result = await handleLogin({ provider: 'invalid-provider' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid provider')
    })

    it('should return 400 when provider is missing', async () => {
      const result = await handleLogin({})

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid provider')
    })

    it('should return 400 when provider is undefined', async () => {
      const result = await handleLogin({ provider: undefined as unknown as string })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.success).toBe(false)
    })

    it('should use default returnTo when not provided', async () => {
      getOAuthConfig.mockResolvedValue({
        authUrl: 'https://github.com/login/oauth/authorize',
        clientId: 'test-client',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'read:user',
      })
      createOAuthState.mockResolvedValue('state')

      const result = await handleLogin({ provider: 'github' })

      expect(result.status).toBe(200)
      expect(createOAuthState).toHaveBeenCalledWith('github', '/bernard/chat')
    })

    it('should return 500 when OAuth is not configured', async () => {
      getOAuthConfig.mockResolvedValue({
        authUrl: '',
        clientId: '',
        redirectUri: '',
        scopes: '',
      })

      const result = await handleLogin({ provider: 'github' })

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('OAuth not configured')
    })

    it('should return 500 when getOAuthConfig throws', async () => {
      getOAuthConfig.mockRejectedValue(new Error('Config error'))

      const result = await handleLogin({ provider: 'github' })

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to initiate login')
    })

    it('should return 500 when createOAuthState throws', async () => {
      getOAuthConfig.mockResolvedValue({
        authUrl: 'https://github.com/login/oauth/authorize',
        clientId: 'test-client',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scopes: 'read:user',
      })
      createOAuthState.mockRejectedValue(new Error('State creation failed'))

      const result = await handleLogin({ provider: 'github' })

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to initiate login')
    })

    it('should return 400 for invalid returnTo parameter', async () => {
      const result = await handleLogin({ provider: 'github', returnTo: 'http://evil.com' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid returnTo parameter')
    })

    it('should return 400 for protocol-relative returnTo', async () => {
      const result = await handleLogin({ provider: 'github', returnTo: '//evil.com/path' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Invalid returnTo parameter')
    })
  })

  describe('validateLoginBody', () => {
    it('should validate valid body', () => {
      expect(validateLoginBody({ provider: 'github', returnTo: '/test' })).toBe(true)
      expect(validateLoginBody({ provider: 'google' })).toBe(true)
      expect(validateLoginBody({})).toBe(true)
    })

    it('should reject invalid body', () => {
      expect(validateLoginBody(null)).toBe(false)
      expect(validateLoginBody('string')).toBe(false)
      expect(validateLoginBody({ provider: 123 })).toBe(false)
      expect(validateLoginBody({ returnTo: 456 })).toBe(false)
      expect(validateLoginBody({ provider: 'github', returnTo: 'http://evil.com' })).toBe(false)
      expect(validateLoginBody({ provider: 'github', returnTo: '//evil.com/path' })).toBe(false)
    })

    it('should reject body with invalid returnTo', () => {
      expect(validateLoginBody({ provider: 'github', returnTo: 'http://evil.com' })).toBe(false)
      expect(validateLoginBody({ provider: 'github', returnTo: '//evil.com/path' })).toBe(false)
      expect(validateLoginBody({ provider: 'github', returnTo: 'javascript:alert(1)' })).toBe(false)
    })
  })

  describe('validateReturnTo', () => {
    it('should validate relative paths', () => {
      expect(validateReturnTo('/')).toBe(true)
      expect(validateReturnTo('/status')).toBe(true)
      expect(validateReturnTo('/dashboard')).toBe(true)
      expect(validateReturnTo('/some/path')).toBe(true)
    })

    it('should reject invalid relative paths', () => {
      expect(validateReturnTo('')).toBe(false)
      expect(validateReturnTo(null as any)).toBe(false)
      expect(validateReturnTo(undefined as any)).toBe(false)
      expect(validateReturnTo('//evil.com/path')).toBe(false)
    })

    it('should reject absolute URLs with schemes', () => {
      expect(validateReturnTo('http://example.com')).toBe(false)
      expect(validateReturnTo('https://example.com')).toBe(false)
      expect(validateReturnTo('ftp://example.com')).toBe(false)
      expect(validateReturnTo('javascript:alert(1)')).toBe(false)
    })

    it('should allow whitelisted domains when configured', () => {
      // Mock environment variable
      const originalEnv = process.env.ALLOWED_REDIRECT_DOMAINS
      process.env.ALLOWED_REDIRECT_DOMAINS = 'example.com,trusted.org'

      expect(validateReturnTo('https://example.com/path')).toBe(true)
      expect(validateReturnTo('http://trusted.org')).toBe(true)
      expect(validateReturnTo('https://evil.com')).toBe(false)

      // Restore
      process.env.ALLOWED_REDIRECT_DOMAINS = originalEnv
    })

    it('should reject non-whitelisted absolute URLs', () => {
      expect(validateReturnTo('https://evil.com')).toBe(false)
      expect(validateReturnTo('http://malicious.net/path')).toBe(false)
    })
  })
})
