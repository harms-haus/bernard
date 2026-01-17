/**
 * Tests for auth types and utilities
 */

import { describe, it, expect } from 'vitest'
import type {
  UserRecord,
  SessionRecord,
  ApiTokenRecord,
  TokenStatus,
  OAuthProvider,
  ProviderConfig,
  AuthenticatedUser,
  AccessGrant,
} from './types'

describe('auth types', () => {
  describe('UserRecord', () => {
    it('should accept valid user record', () => {
      const user: UserRecord = {
        id: 'user-123',
        displayName: 'Test User',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      expect(user.id).toBe('user-123')
      expect(user.status).toBe('active')
    })

    it('should accept optional email and avatarUrl', () => {
      const user: UserRecord = {
        id: 'user-123',
        displayName: 'Test User',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        email: 'test@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }
      expect(user.email).toBe('test@example.com')
      expect(user.avatarUrl).toBe('https://example.com/avatar.png')
    })

    it('should accept all status values', () => {
      const activeUser: UserRecord = {
        id: '1',
        displayName: 'Active',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      expect(activeUser.status).toBe('active')

      const disabledUser: UserRecord = {
        id: '2',
        displayName: 'Disabled',
        role: 'user',
        status: 'disabled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      expect(disabledUser.status).toBe('disabled')

      const deletedUser: UserRecord = {
        id: '3',
        displayName: 'Deleted',
        role: 'user',
        status: 'deleted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      expect(deletedUser.status).toBe('deleted')
    })
  })

  describe('SessionRecord', () => {
    it('should accept valid session record', () => {
      const session: SessionRecord = {
        id: 'session-123',
        userId: 'user-456',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }
      expect(session.id).toBe('session-123')
      expect(session.userId).toBe('user-456')
    })

    it('should accept optional userAgent and ipAddress', () => {
      const session: SessionRecord = {
        id: 'session-123',
        userId: 'user-456',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
      }
      expect(session.userAgent).toBe('Mozilla/5.0')
      expect(session.ipAddress).toBe('192.168.1.1')
    })
  })

  describe('ApiTokenRecord', () => {
    it('should accept valid token record', () => {
      const token: ApiTokenRecord = {
        id: 'token-123',
        name: 'My API Token',
        token: 'brnd-abc123',
        status: 'active',
        userId: 'user-456',
        createdAt: new Date().toISOString(),
      }
      expect(token.id).toBe('token-123')
      expect(token.status).toBe('active')
    })

    it('should accept optional lastUsedAt', () => {
      const token: ApiTokenRecord = {
        id: 'token-123',
        name: 'My API Token',
        token: 'brnd-abc123',
        status: 'active',
        userId: 'user-456',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      }
      expect(token.lastUsedAt).toBeDefined()
    })

    it('should accept revoked status', () => {
      const token: ApiTokenRecord = {
        id: 'token-123',
        name: 'Revoked Token',
        token: 'brnd-xyz789',
        status: 'revoked',
        createdAt: new Date().toISOString(),
      }
      expect(token.status).toBe('revoked')
    })
  })

  describe('TokenStatus', () => {
    it('should accept "active" status', () => {
      const status: TokenStatus = 'active'
      expect(status).toBe('active')
    })

    it('should accept "revoked" status', () => {
      const status: TokenStatus = 'revoked'
      expect(status).toBe('revoked')
    })
  })

  describe('OAuthProvider', () => {
    it('should accept "default" provider', () => {
      const provider: OAuthProvider = 'default'
      expect(provider).toBe('default')
    })

    it('should accept "google" provider', () => {
      const provider: OAuthProvider = 'google'
      expect(provider).toBe('google')
    })

    it('should accept "github" provider', () => {
      const provider: OAuthProvider = 'github'
      expect(provider).toBe('github')
    })
  })

  describe('ProviderConfig', () => {
    it('should accept valid provider config', () => {
      const config: ProviderConfig = {
        authUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        userInfoUrl: 'https://example.com/userinfo',
        redirectUri: 'http://localhost:3000/callback',
        scope: 'openid profile',
        clientId: 'client-123',
        clientSecret: 'secret-456',
      }
      expect(config.authUrl).toBe('https://example.com/auth')
      expect(config.clientId).toBe('client-123')
    })

    it('should accept config without clientSecret', () => {
      const config: ProviderConfig = {
        authUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        userInfoUrl: 'https://example.com/userinfo',
        redirectUri: 'http://localhost:3000/callback',
        scope: 'openid',
        clientId: 'client-123',
      }
      expect(config.clientSecret).toBeUndefined()
    })
  })

  describe('AuthenticatedUser', () => {
    it('should accept valid authenticated user', () => {
      const authUser: AuthenticatedUser = {
        user: {
          id: 'user-123',
          displayName: 'Test User',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        sessionId: 'session-456',
      }
      expect(authUser.user.id).toBe('user-123')
      expect(authUser.sessionId).toBe('session-456')
    })

    it('should accept null sessionId', () => {
      const authUser: AuthenticatedUser = {
        user: {
          id: 'user-123',
          displayName: 'Test User',
          role: 'admin',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        sessionId: null,
      }
      expect(authUser.sessionId).toBeNull()
      expect(authUser.user.role).toBe('admin')
    })
  })

  describe('AccessGrant', () => {
    it('should accept valid access grant from session', () => {
      const grant: AccessGrant = {
        token: 'session-token-123',
        source: 'session',
        user: {
          id: 'user-456',
          displayName: 'Test User',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
      expect(grant.source).toBe('session')
      expect(grant.user).toBeDefined()
    })

    it('should accept valid access grant from API token', () => {
      const grant: AccessGrant = {
        token: 'brnd-api-token-123',
        source: 'api-token',
      }
      expect(grant.source).toBe('api-token')
      expect(grant.user).toBeUndefined()
    })
  })
})
