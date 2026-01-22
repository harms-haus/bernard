import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  normalizeList,
  resolveBaseUrl,
  resolveApiKey,
  splitModelAndProvider,
  setSettingsFetcher,
  resetSettingsFetcher,
  resolveModel,
  resolveUtilityModel,
} from './models'

describe('models', () => {
  afterEach(() => {
    resetSettingsFetcher()
  })

  describe('normalizeList', () => {
    it('should return empty array for null/undefined', () => {
      expect(normalizeList(null)).toEqual([])
      expect(normalizeList(undefined)).toEqual([])
      expect(normalizeList('')).toEqual([])
    })

    it('should return array as-is', () => {
      expect(normalizeList(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    })

    it('should trim whitespace from items', () => {
      expect(normalizeList(' a , b , c ')).toEqual(['a', 'b', 'c'])
    })

    it('should parse JSON array string', () => {
      expect(normalizeList('["a", "b", "c"]')).toEqual(['a', 'b', 'c'])
    })

    it('should remove quotes from items', () => {
      expect(normalizeList('"a", "b", "c"')).toEqual(['a', 'b', 'c'])
      expect(normalizeList("'a', 'b', 'c'")).toEqual(['a', 'b', 'c'])
    })

    it('should filter empty strings', () => {
      expect(normalizeList('a,,b,,c')).toEqual(['a', 'b', 'c'])
    })
  })

  describe('resolveBaseUrl', () => {
    it('should return default baseUrl if no baseUrl provided', () => {
      expect(resolveBaseUrl(undefined)).toBe('https://openrouter.ai/api/v1')
    })

    it('should return baseUrl when provided', () => {
      expect(resolveBaseUrl('https://api.example.com')).toBe('https://api.example.com')
    })
  })

  describe('resolveApiKey', () => {
    it('should return undefined if no apiKey provided', () => {
      expect(resolveApiKey(undefined)).toBeUndefined()
    })

    it('should return apiKey when provided', () => {
      expect(resolveApiKey('sk-test123')).toBe('sk-test123')
    })
  })

  describe('splitModelAndProvider', () => {
    it('should parse model ID with provider', () => {
      const result = splitModelAndProvider('gpt-4|openai')
      expect(result.model).toBe('gpt-4')
      expect(result.providerOnly).toEqual(['openai'])
    })

    it('should handle model without provider', () => {
      const result = splitModelAndProvider('gpt-4')
      expect(result.model).toBe('gpt-4')
      expect(result.providerOnly).toBeUndefined()
    })
  })

  describe('setSettingsFetcher', () => {
    it('should replace default fetcher', async () => {
      let called = false
      setSettingsFetcher(async () => {
        called = true
        return {
          models: {
            providers: [{ id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://test.com', createdAt: '', updatedAt: '' }],
            utility: { primary: 'test-model', providerId: 'test' },
            agents: [
              {
                agentId: 'bernard_agent',
                roles: [{ id: 'main', primary: 'test-model', providerId: 'test' }]
              }
            ],
          },
          services: {
            memory: { embeddingModel: 'test' },
            search: {},
            weather: { provider: 'open-meteo' },
            geocoding: {},
            infrastructure: {},
          },
          oauth: {
            default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
            google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
            github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          },
          backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
          limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
          automations: {},
        }
      })

      await resolveModel('bernard_agent', 'main')
      expect(called).toBe(true)
    })
  })

  describe('resolveModel', () => {
    it('should resolve agent model with openai provider options', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'openai-provider', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-test', createdAt: '', updatedAt: '' }],
          utility: { primary: 'gpt-3.5-turbo', providerId: 'openai-provider' },
          agents: [
            {
              agentId: 'bernard_agent',
              roles: [{ id: 'main', primary: 'gpt-4', providerId: 'openai-provider', options: { temperature: 0.7 } }]
            }
          ],
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await resolveModel('bernard_agent', 'main')
      expect(result.id).toBe('gpt-4')
      expect(result.options.modelProvider).toBe('openai')
      expect(result.options.configuration?.baseURL).toBe('https://api.openai.com')
      expect(result.options.configuration?.apiKey).toBe('sk-test')
      expect(result.options.temperature).toBe(0.7)
    })

    it('should resolve agent model with ollama provider options', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'ollama-provider', name: 'Ollama', type: 'ollama', baseUrl: 'http://localhost:11434', createdAt: '', updatedAt: '' }],
          utility: { primary: 'gpt-3.5-turbo', providerId: 'ollama-provider' },
          agents: [
            {
              agentId: 'bernard_agent',
              roles: [{ id: 'main', primary: 'llama3', providerId: 'ollama-provider', options: { temperature: 0.5 } }]
            }
          ],
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await resolveModel('bernard_agent', 'main')
      expect(result.id).toBe('llama3')
      expect(result.options.modelProvider).toBe('ollama')
      expect(result.options.baseUrl).toBe('http://localhost:11434')
      expect(result.options.temperature).toBe(0.5)
    })

    it('should throw error for unknown agent', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://test.com', createdAt: '', updatedAt: '' }],
          utility: { primary: 'test-model', providerId: 'test' },
          agents: [],
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      await expect(resolveModel('unknown_agent', 'main')).rejects.toThrow('Unknown agent: unknown_agent')
    })
  })

  describe('resolveUtilityModel', () => {
    it('should resolve utility model with openai provider options', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'openai-provider', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-test', createdAt: '', updatedAt: '' }],
          utility: { primary: 'gpt-3.5-turbo', providerId: 'openai-provider', options: { temperature: 0.3 } },
          agents: [],
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await resolveUtilityModel()
      expect(result.id).toBe('gpt-3.5-turbo')
      expect(result.options.modelProvider).toBe('openai')
      expect(result.options.configuration?.baseURL).toBe('https://api.openai.com')
      expect(result.options.configuration?.apiKey).toBe('sk-test')
      expect(result.options.temperature).toBe(0.3)
    })

    it('should handle override option', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://test.com', createdAt: '', updatedAt: '' }],
          utility: { primary: 'default-model', providerId: 'test' },
          agents: [],
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await resolveUtilityModel({ override: 'override-model' })
      expect(result.id).toBe('override-model')
    })
  })
})
