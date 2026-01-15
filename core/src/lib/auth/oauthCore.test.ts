import { describe, it, expect, vi } from 'vitest'
import { base64Encode, base64UrlEncode, createCodeVerifier, createChallenge, exchangeCode, fetchUserInfo } from './oauthCore'
import type { OAuthProvider, ProviderConfig } from './types'

describe('oauthCore', () => {
  describe('base64Encode', () => {
    it('should encode buffer to base64', () => {
      const buffer = Buffer.from('hello world')
      const result = base64Encode(buffer)
      expect(result).toBe(Buffer.from('hello world').toString('base64'))
    })

    it('should encode empty buffer', () => {
      const result = base64Encode(Buffer.from(''))
      expect(result).toBe('')
    })

    it('should encode special characters', () => {
      const buffer = Buffer.from('hello\nworld\ttab')
      const result = base64Encode(buffer)
      expect(result).toBeTruthy()
      expect(Buffer.from(result, 'base64').toString()).toBe('hello\nworld\ttab')
    })
  })

  describe('base64UrlEncode', () => {
    it('should encode buffer to base64url', () => {
      const buffer = Buffer.from('hello+world/test==')
      const result = base64UrlEncode(buffer)
      expect(result).not.toContain('+')
      expect(result).not.toContain('/')
      expect(result).not.toContain('=')
    })

    it('should handle empty buffer', () => {
      const result = base64UrlEncode(Buffer.from(''))
      expect(result).toBe('')
    })

    it('should produce reversible encoding', () => {
      const original = 'test@example.com/path?query=value'
      const encoded = base64UrlEncode(Buffer.from(original))
      // Convert base64url back to base64 for decoding
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
      const decoded = Buffer.from(base64, 'base64').toString()
      expect(decoded).toBe(original)
    })
  })

  describe('createCodeVerifier', () => {
    it('should return 64 character string', () => {
      const result = createCodeVerifier()
      expect(result).toHaveLength(64)
    })

    it('should only contain valid characters', () => {
      const result = createCodeVerifier()
      const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
      for (const char of result) {
        expect(validChars).toContain(char)
      }
    })

    it('should generate different values on each call', () => {
      const result1 = createCodeVerifier()
      const result2 = createCodeVerifier()
      expect(result1).not.toBe(result2)
    })
  })

  describe('createChallenge', () => {
    it('should create SHA256 hash of verifier', () => {
      const verifier = createCodeVerifier()
      const challenge = createChallenge(verifier)
      
      expect(challenge).toHaveLength(43) // base64url encoded SHA256
      expect(challenge).not.toBe(verifier)
    })

    it('should produce deterministic results', () => {
      const verifier = 'test-verifier-string'
      const challenge1 = createChallenge(verifier)
      const challenge2 = createChallenge(verifier)
      expect(challenge1).toBe(challenge2)
    })

    it('should be different for different verifiers', () => {
      const challenge1 = createChallenge('verifier-1')
      const challenge2 = createChallenge('verifier-2')
      expect(challenge1).not.toBe(challenge2)
    })
  })

  describe('exchangeCode', () => {
    it('should throw for failed token exchange', async () => {
      const provider: OAuthProvider = 'github'
      const config: ProviderConfig = {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        redirectUri: 'http://localhost:3000/auth/callback',
        scope: 'read:user',
        clientId: 'test-client',
        clientSecret: 'test-secret',
      }
      
      // Mock fetch to return error
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('invalid_grant'),
        headers: new Headers(),
      } as unknown as Response)

      await expect(exchangeCode(provider, config, 'invalid-code', 'verifier'))
        .rejects.toThrow('Token exchange failed')
    })
  })

  describe('fetchUserInfo', () => {
    it('should throw for failed request', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
        headers: new Headers(),
      } as unknown as Response)

      await expect(fetchUserInfo('github', 'https://api.github.com/user', 'invalid-token'))
        .rejects.toThrow('Userinfo failed')
    })

    it('should throw for missing subject in response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ name: 'Test User' }),
        headers: new Headers(),
      } as unknown as Response)

      await expect(fetchUserInfo('github', 'https://api.github.com/user', 'token'))
        .rejects.toThrow('Userinfo response missing subject')
    })

    it('should parse GitHub user response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 12345,
          name: 'Test User',
          email: 'test@example.com',
          avatar_url: 'https://github.com/avatar.png',
        }),
        headers: new Headers(),
      } as unknown as Response)

      const result = await fetchUserInfo('github', 'https://api.github.com/user', 'token')

      expect(result.id).toBe('12345')
      expect(result.displayName).toBe('Test User')
      expect(result.email).toBe('test@example.com')
      expect(result.avatarUrl).toBe('https://github.com/avatar.png')
    })

    it('should parse Google user response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: 'google-123',
          name: 'Google User',
          email: 'google@example.com',
          picture: 'https://google.com/avatar.png',
        }),
        headers: new Headers(),
      } as unknown as Response)

      const result = await fetchUserInfo('google', 'https://google.com/userinfo', 'token')

      expect(result.id).toBe('google-123')
      expect(result.displayName).toBe('Google User')
      expect(result.email).toBe('google@example.com')
      expect(result.avatarUrl).toBe('https://google.com/avatar.png')
    })

    it('should handle missing optional fields', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: '12345',
        }),
        headers: new Headers(),
      } as unknown as Response)

      const result = await fetchUserInfo('default', 'https://example.com/user', 'token')

      expect(result.id).toBe('12345')
      expect(result.displayName).toBe('12345') // Falls back to id
      expect(result.email).toBeUndefined()
      expect(result.avatarUrl).toBeUndefined()
    })

    it('should prefer login over email for GitHub display name', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 12345,
          login: 'testuser',
          email: null,
        }),
        headers: new Headers(),
      } as unknown as Response)

      const result = await fetchUserInfo('github', 'https://api.github.com/user', 'token')

      expect(result.displayName).toBe('testuser')
    })
  })
})
