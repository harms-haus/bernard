import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SettingsManagerCore, type RedisClient } from './appSettings'

function createMockRedis(): RedisClient {
  const store = new Map<string, string>()

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
      return 'OK'
    }),
  }
}

describe('SettingsManagerCore', () => {
  let manager: SettingsManagerCore
  let mockRedis: RedisClient

  beforeEach(() => {
    mockRedis = createMockRedis()
    manager = new SettingsManagerCore(mockRedis, {
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379',
      OLLAMA_BASE_URL: 'http://localhost:11434/v1',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    })
    manager.loadEnv('/test/.env', {
      NODE_ENV: 'test',
    })
  })

  describe('loadEnv', () => {
    it('should load environment variables', () => {
      expect(manager['envData']).toEqual({
        NODE_ENV: 'test',
        REDIS_URL: 'redis://localhost:6379',
        OLLAMA_BASE_URL: 'http://localhost:11434/v1',
        OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
       })
    })

    it('should only load once', () => {
      const initialData = { ...manager['envData'] }
      manager.loadEnv('/another/.env', { NEW_VAR: 'value' })
      expect(manager['envData']).toEqual(initialData)
    })
  })

  describe('getFromEnv', () => {
    it('should return value from envData', () => {
      expect(manager['envData']['NODE_ENV']).toBe('test')
    })

    it('should return undefined for missing key', () => {
      expect(manager['envData']['MISSING_VAR']).toBeUndefined()
    })
  })

  describe('normalizeList', () => {
    it('should return empty array for null/undefined', () => {
      expect(manager.normalizeList(null)).toEqual([])
      expect(manager.normalizeList(undefined)).toEqual([])
    })

    it('should parse JSON array', () => {
      expect(manager.normalizeList('["a", "b", "c"]')).toEqual(['a', 'b', 'c'])
    })

    it('should parse comma-separated string', () => {
      expect(manager.normalizeList('a, b, c')).toEqual(['a', 'b', 'c'])
    })

    it('should handle array input', () => {
      expect(manager.normalizeList(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    })
  })

  describe('getDefaultModels', () => {
    it('should return default models configuration', () => {
      const models = manager.getDefaultModels()

      expect(models.providers).toHaveLength(2)
      expect(models.providers[0].id).toBe('ollama-provider')
      expect(models.providers[1].id).toBe('default-provider')
      expect(models.response.primary).toBe('gpt-3.5-turbo')
    })

    it('should use environment variables for defaults', () => {
      const managerWithCustomEnv = new SettingsManagerCore(mockRedis, {
        RESPONSE_MODELS: 'gpt-4-custom',
      })
      const models = managerWithCustomEnv.getDefaultModels()

      expect(models.response.primary).toBe('gpt-4-custom')
    })
  })

  describe('getDefaultServices', () => {
    it('should return default services configuration', () => {
      const services = manager.getDefaultServices()

      expect(services.memory).toBeDefined()
      expect(services.search).toBeDefined()
      expect(services.weather).toBeDefined()
      expect(services.geocoding).toBeDefined()
      expect(services.infrastructure).toBeDefined()
      expect(services.weather.provider).toBe('open-meteo')
    })

    it('should use REDIS_URL from environment', () => {
      const services = manager.getDefaultServices()
      expect(services.infrastructure.redisUrl).toBe('redis://localhost:6379')
    })
  })

  describe('getDefaultOauth', () => {
    it('should return default OAuth configuration', () => {
      const oauth = manager.getDefaultOauth()

      expect(oauth.default).toBeDefined()
      expect(oauth.google).toBeDefined()
      expect(oauth.github).toBeDefined()
      expect(oauth.default.scope).toBe('openid profile')
    })

    it('should use environment variables for OAuth settings', () => {
      const managerWithOAuth = new SettingsManagerCore(mockRedis, {
        OAUTH_CLIENT_ID: 'test-client-id',
        OAUTH_CLIENT_SECRET: 'test-client-secret',
      })
      const oauth = managerWithOAuth.getDefaultOauth()

      expect(oauth.default.clientId).toBe('test-client-id')
      expect(oauth.default.clientSecret).toBe('test-client-secret')
    })
  })

  describe('getDefaultBackups', () => {
    it('should return default backup settings', () => {
      const backups = manager.getDefaultBackups()

      expect(backups.debounceSeconds).toBe(60)
      expect(backups.retentionDays).toBe(14)
      expect(backups.retentionCount).toBe(20)
      expect(backups.directory).toContain('backups')
    })
  })

  describe('getDefaultLimits', () => {
    it('should return default limits', () => {
      const limits = manager.getDefaultLimits()

      expect(limits.currentRequestMaxTokens).toBe(8000)
      expect(limits.responseMaxTokens).toBe(8000)
      expect(limits.allowSignups).toBe(true)
    })

    it('should respect ALLOW_SIGNUPS environment variable', () => {
      const managerNoUsers = new SettingsManagerCore(mockRedis, {
        ALLOW_SIGNUPS: 'false',
      })
      const limits = managerNoUsers.getDefaultLimits()

      expect(limits.allowSignups).toBe(false)
    })
  })

  describe('Redis integration', () => {
    it('should store and retrieve settings from Redis', async () => {
      await manager.setBackups({
        debounceSeconds: 120,
        directory: '/custom/backups',
        retentionDays: 30,
        retentionCount: 50,
      })

      const backups = await manager.getBackups()

      expect(backups.debounceSeconds).toBe(120)
      expect(backups.retentionDays).toBe(30)
      expect(backups.directory).toBe('/custom/backups')
    })

    it('should use Redis value over defaults', async () => {
      const redisStore = new Map<string, string>()
      redisStore.set('bernard:settings:backups', JSON.stringify({
        debounceSeconds: 300,
        directory: '/redis/backups',
        retentionDays: 60,
        retentionCount: 100,
      }))

      const redisWithData: RedisClient = {
        get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
        set: vi.fn(async () => 'OK'),
      }

      const managerWithRedis = new SettingsManagerCore(redisWithData, {})
      const backups = await managerWithRedis.getBackups()

      expect(backups.debounceSeconds).toBe(300)
      expect(backups.directory).toBe('/redis/backups')
    })
  })

  describe('Provider management', () => {
    it('should add a new provider', async () => {
      const newProvider = await manager.addProvider({
        name: 'Test Provider',
        type: 'openai',
        baseUrl: 'https://api.test.com/v1',
        apiKey: 'test-key',
      })

      expect(newProvider.id).toBeDefined()
      expect(newProvider.name).toBe('Test Provider')
      expect(newProvider.createdAt).toBeDefined()
      expect(newProvider.updatedAt).toBeDefined()
    })

    it('should update an existing provider', async () => {
      const providers = await manager.getModels()
      const providerToUpdate = providers.providers[0]

      const updated = await manager.updateProvider(providerToUpdate.id, {
        name: 'Updated Provider',
      })

      expect(updated).not.toBeNull()
      expect(updated?.name).toBe('Updated Provider')
    })

    it('should return null when updating non-existent provider', async () => {
      const updated = await manager.updateProvider('non-existent-id', {
        name: 'Updated',
      })

      expect(updated).toBeNull()
    })

    it('should delete a provider', async () => {
      const providers = await manager.getModels()
      const providerToDelete = providers.providers[0]
      const initialCount = providers.providers.length

      const result = await manager.deleteProvider(providerToDelete.id)

      expect(result).toBe(true)

      const updatedProviders = await manager.getModels()
      expect(updatedProviders.providers.length).toBe(initialCount - 1)
    })

    it('should return false when deleting non-existent provider', async () => {
      const result = await manager.deleteProvider('non-existent-id')
      expect(result).toBe(false)
    })
  })

  describe('getAll', () => {
    it('should return all settings sections', async () => {
      const all = await manager.getAll()

      expect(all.models).toBeDefined()
      expect(all.services).toBeDefined()
      expect(all.oauth).toBeDefined()
      expect(all.backups).toBeDefined()
      expect(all.limits).toBeDefined()
      expect(all.automations).toBeDefined()
    })
  })
})
