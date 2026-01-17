import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import {
  normalizeList,
  listFromSettings,
  resolveBaseUrl,
  resolveApiKey,
  splitModelAndProvider,
  setSettingsFetcher,
  resetSettingsFetcher,
  getPrimaryModel,
  getModelList,
  resolveModel,
} from './models'
import type { ModelCategorySettings } from './settingsStore'

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

  describe('listFromSettings', () => {
    it('should return empty array for undefined settings', () => {
      expect(listFromSettings('response')).toEqual([])
    })

    it('should return primary model from settings', () => {
      const settings: ModelCategorySettings = {
        primary: 'gpt-4',
        providerId: 'openai',
      }
      expect(listFromSettings('response', settings)).toEqual(['gpt-4'])
    })

    it('should trim model name', () => {
      const settings: ModelCategorySettings = {
        primary: '  gpt-4  ',
        providerId: 'openai',
      }
      expect(listFromSettings('response', settings)).toEqual(['gpt-4'])
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
            response: { primary: 'test-model', providerId: 'test' },
            router: { primary: 'test', providerId: 'test' },
            utility: { primary: 'test', providerId: 'test' },
            memory: { primary: 'test', providerId: 'test' },
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

      await getPrimaryModel('response')
      expect(called).toBe(true)
    })
  })

  describe('getModelList', () => {
    it('should return override if provided', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://test.com', createdAt: '', updatedAt: '' }],
          response: { primary: 'settings-model', providerId: 'test' },
          router: { primary: 'test', providerId: 'test' },
          utility: { primary: 'test', providerId: 'test' },
          memory: { primary: 'test', providerId: 'test' },
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await getModelList('response', { override: 'override-model' })
      expect(result).toEqual(['override-model'])
    })

    it('should return settings model if no override', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://test.com', createdAt: '', updatedAt: '' }],
          response: { primary: 'settings-model', providerId: 'test' },
          router: { primary: 'test', providerId: 'test' },
          utility: { primary: 'test', providerId: 'test' },
          memory: { primary: 'test', providerId: 'test' },
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await getModelList('response')
      expect(result).toEqual(['settings-model'])
    })

    it('should return fallback if no settings', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://test.com', createdAt: '', updatedAt: '' }],
          response: { primary: '', providerId: 'test' },
          router: { primary: 'test', providerId: 'test' },
          utility: { primary: 'test', providerId: 'test' },
          memory: { primary: 'test', providerId: 'test' },
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await getModelList('response', { fallback: ['fallback-model'] })
      expect(result).toEqual(['fallback-model'])
    })

    it('should return default model if nothing else', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://test.com', createdAt: '', updatedAt: '' }],
          response: { primary: '', providerId: 'test' },
          router: { primary: 'test', providerId: 'test' },
          utility: { primary: 'test', providerId: 'test' },
          memory: { primary: 'test', providerId: 'test' },
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await getModelList('response')
      expect(result).toEqual(['gpt-3.5-turbo'])
    })
  })

  describe('resolveModel', () => {
    it('should resolve model with openai provider options', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'openai-provider', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-test', createdAt: '', updatedAt: '' }],
          response: { primary: 'gpt-4', providerId: 'openai-provider', options: { temperature: 0.7 } },
          router: { primary: 'test', providerId: 'openai-provider' },
          utility: { primary: 'test', providerId: 'openai-provider' },
          memory: { primary: 'test', providerId: 'openai-provider' },
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await resolveModel('response')
      expect(result.id).toBe('gpt-4')
      expect(result.options.modelProvider).toBe('openai')
      expect(result.options.configuration?.baseURL).toBe('https://api.openai.com')
      expect(result.options.configuration?.apiKey).toBe('sk-test')
      expect(result.options.temperature).toBe(0.7)
    })

    it('should resolve model with ollama provider options', async () => {
      setSettingsFetcher(async () => ({
        models: {
          providers: [{ id: 'ollama-provider', name: 'Ollama', type: 'ollama', baseUrl: 'http://localhost:11434', createdAt: '', updatedAt: '' }],
          response: { primary: 'llama3', providerId: 'ollama-provider', options: { temperature: 0.5 } },
          router: { primary: 'test', providerId: 'ollama-provider' },
          utility: { primary: 'test', providerId: 'ollama-provider' },
          memory: { primary: 'test', providerId: 'ollama-provider' },
        },
        services: { memory: {}, search: {}, weather: { provider: 'open-meteo' }, geocoding: {}, infrastructure: {} },
        oauth: { default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
          github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' } },
        backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
        limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
        automations: {},
      }))

      const result = await resolveModel('response')
      expect(result.id).toBe('llama3')
      expect(result.options.modelProvider).toBe('ollama')
      expect(result.options.baseUrl).toBe('http://localhost:11434')
      expect(result.options.temperature).toBe(0.5)
    })
  })
})
