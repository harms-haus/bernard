import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest'
import { getSettings, clearSettingsCache } from './settingsCache'
import { SettingsStore } from './settingsStore'
import type { BernardSettings } from './appSettings'

// Mock the SettingsStore class
const mockGetAll = vi.fn()
const mockSettingsStore = {
  getAll: mockGetAll
}

vi.mock('./settingsStore', () => ({
  SettingsStore: vi.fn().mockImplementation(() => mockSettingsStore)
}))

describe('settingsCache', () => {
  // Create a minimal but valid BernardSettings mock
  const createMockSettings = (): BernardSettings => {
    const defaultProvider = {
      id: 'default-provider',
      name: 'Default Provider',
      type: 'openai' as const,
      baseUrl: 'https://openrouter.ai/api/v1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      testStatus: 'untested' as const,
    }

    return {
      models: {
        providers: [defaultProvider],
        response: { primary: 'gpt-4', providerId: defaultProvider.id, options: { temperature: 0.5 } },
        router: { primary: 'gpt-3.5-turbo', providerId: defaultProvider.id, options: { temperature: 0 } },
        memory: { primary: 'gpt-4o-mini', providerId: defaultProvider.id, options: { temperature: 0 } },
        utility: { primary: 'gpt-3.5-turbo', providerId: defaultProvider.id, options: { temperature: 0 } },
        aggregation: { primary: 'gpt-4', providerId: defaultProvider.id },
        embedding: { primary: 'text-embedding-3-small', providerId: defaultProvider.id },
      },
      services: {
        memory: {
          embeddingModel: 'nomic-embed-text',
          embeddingBaseUrl: 'http://localhost:11434/v1',
          indexName: 'bernard',
          keyPrefix: 'bernard:',
          namespace: 'default',
        },
        search: {
          apiKey: 'test-key',
          apiUrl: 'https://api.search.com',
        },
        weather: {
          provider: 'open-meteo',
          forecastUrl: 'https://api.open-meteo.com/v1/forecast',
          historicalUrl: 'https://archive-api.open-meteo.com/v1/archive',
        },
        geocoding: {
          url: 'https://nominatim.openstreetmap.org',
          userAgent: 'BernardAI/1.0',
        },
        infrastructure: {
          redisUrl: 'redis://localhost:6379',
          queuePrefix: 'bernard',
          taskQueueName: 'tasks',
          taskWorkerConcurrency: 5,
          taskMaxRuntimeMs: 300000,
          taskAttempts: 3,
          taskBackoffMs: 5000,
          taskKeepCompleted: 100,
          taskKeepFailed: 20,
          taskArchiveAfterDays: 7,
        },
      },
      oauth: {
        default: {
          authUrl: 'https://auth.example.com',
          tokenUrl: 'https://auth.example.com/token',
          userInfoUrl: 'https://auth.example.com/userinfo',
          redirectUri: 'http://localhost:3456/auth/callback',
          scope: 'openid profile email',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
        google: {
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
          redirectUri: 'http://localhost:3456/auth/callback',
          scope: 'openid profile email',
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
        },
        github: {
          authUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          userInfoUrl: 'https://api.github.com/user',
          redirectUri: 'http://localhost:3456/auth/callback',
          scope: 'openid profile email',
          clientId: 'github-client-id',
          clientSecret: 'github-client-secret',
        },
      },
      backups: {
        debounceSeconds: 60,
        directory: '/tmp/bernard/backups',
        retentionDays: 14,
        retentionCount: 20,
      },
      limits: {
        currentRequestMaxTokens: 8000,
        responseMaxTokens: 8000,
        allowUserCreation: true,
      },
      automations: {},
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    clearSettingsCache()
    mockGetAll.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getSettings', () => {
    it('should call SettingsStore.getAll() on first call', async () => {
      const mockSettings = createMockSettings()
      mockGetAll.mockResolvedValue(mockSettings)

      const settings = await getSettings()

      expect(mockGetAll).toHaveBeenCalledTimes(1)
      expect(settings).toEqual(mockSettings)
    })

    it('should cache settings and not call getAll on subsequent calls within TTL', async () => {
      const mockSettings = createMockSettings()
      mockGetAll.mockResolvedValue(mockSettings)

      await getSettings()
      await getSettings()
      await getSettings()

      expect(mockGetAll).toHaveBeenCalledTimes(1)
    })

    it('should use cached value when within TTL', async () => {
      const mockSettings = createMockSettings()
      mockSettings.models.response.primary = 'first-call'
      mockGetAll.mockResolvedValue(mockSettings)

      const settings1 = await getSettings()

      // Change the mock to return different settings
      const mockSettings2 = createMockSettings()
      mockSettings2.models.response.primary = 'second-call'
      mockGetAll.mockResolvedValue(mockSettings2)

      const settings2 = await getSettings()

      expect(settings1.models.response.primary).toBe('first-call')
      expect(settings2.models.response.primary).toBe('first-call') // Still cached
    })

    it('should bypass cache when forceRefresh is true', async () => {
      const mockSettings = createMockSettings()
      mockSettings.models.response.primary = 'initial'
      mockGetAll.mockResolvedValue(mockSettings)

      await getSettings()

      // Change the mock
      const mockSettings2 = createMockSettings()
      mockSettings2.models.response.primary = 'refreshed'
      mockGetAll.mockResolvedValue(mockSettings2)

      const settings = await getSettings(true)

      expect(mockGetAll).toHaveBeenCalledTimes(2)
      expect(settings.models.response.primary).toBe('refreshed')
    })
  })

  describe('clearSettingsCache', () => {
    it('should clear cached settings', async () => {
      const mockSettings = createMockSettings()
      mockGetAll.mockResolvedValue(mockSettings)

      await getSettings()
      expect(mockGetAll).toHaveBeenCalledTimes(1)

      clearSettingsCache()

      // Create new mock for second call
      const mockSettings2 = createMockSettings()
      mockGetAll.mockResolvedValue(mockSettings2)

      await getSettings()
      expect(mockGetAll).toHaveBeenCalledTimes(2)
    })

    it('should force new fetch after cache clear even within TTL', async () => {
      const mockSettings = createMockSettings()
      mockSettings.models.response.primary = 'cached'
      mockGetAll.mockResolvedValue(mockSettings)

      await getSettings()

      // Change mock to return different settings
      const mockSettings2 = createMockSettings()
      mockSettings2.models.response.primary = 'fresh'
      mockGetAll.mockResolvedValue(mockSettings2)

      clearSettingsCache()
      const settings = await getSettings()

      expect(settings.models.response.primary).toBe('fresh')
    })
  })

  describe('TTL expiration', () => {
    it('should fetch new settings after TTL expires', async () => {
      const mockSettings = createMockSettings()
      mockSettings.models.response.primary = 'original'
      mockGetAll.mockResolvedValue(mockSettings)

      await getSettings()

      // Advance timers past the 5 second TTL
      vi.advanceTimersByTime(6000)

      // Change mock for the new call
      const mockSettings2 = createMockSettings()
      mockSettings2.models.response.primary = 'expired'
      mockGetAll.mockResolvedValue(mockSettings2)

      const settings = await getSettings()

      expect(mockGetAll).toHaveBeenCalledTimes(2)
      expect(settings.models.response.primary).toBe('expired')
    })
  })
})
