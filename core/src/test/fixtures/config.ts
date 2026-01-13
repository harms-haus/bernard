import { ProviderSchema, ModelsSettingsSchema, ServicesSettingsSchema } from '@/lib/config/appSettings'
import type { z } from 'zod'

export function mockProviderSchema(overrides: Partial<z.infer<typeof ProviderSchema>> = {}): z.infer<typeof ProviderSchema> {
  return {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'mock-api-key-12345',
    baseUrl: 'https://api.openai.com/v1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function mockModelConfig(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'gpt-4',
    providerId: 'openai',
    name: 'GPT-4',
    type: 'chat',
    contextLength: 128000,
    ...overrides,
  }
}

export function mockModelsSettings(overrides: Partial<z.infer<typeof ModelsSettingsSchema>> = {}): z.infer<typeof ModelsSettingsSchema> {
  return {
    providers: [mockProviderSchema()],
    response: {
      primary: 'openai|gpt-4',
      providerId: 'openai',
    },
    router: {
      primary: 'openai|gpt-4',
      providerId: 'openai',
    },
    memory: {
      primary: 'openai|gpt-4',
      providerId: 'openai',
    },
    utility: {
      primary: 'openai|gpt-4',
      providerId: 'openai',
    },
    ...overrides,
  }
}

export function mockServicesSettings(overrides: Partial<z.infer<typeof ServicesSettingsSchema>> = {}): z.infer<typeof ServicesSettingsSchema> {
  return {
    memory: {
      embeddingModel: 'nomic-embed-text',
      embeddingBaseUrl: 'http://localhost:11434',
    },
    search: {},
    weather: {
      provider: 'openweathermap',
      apiUrl: 'https://api.openweathermap.org/data/3.0',
      apiKey: 'mock-weather-api-key',
    },
    geocoding: {},
    infrastructure: {
      redisUrl: 'redis://localhost:6379',
      queuePrefix: 'bernard',
    },
    overseerr: {
      baseUrl: 'http://localhost:5055',
      apiKey: 'mock-overseerr-key',
    },
    plex: {
      baseUrl: 'http://localhost:32400',
      token: 'mock-plex-token',
    },
    homeAssistant: {
      baseUrl: 'http://localhost:8123',
      accessToken: 'mock-ha-token',
    },
    ...overrides,
  }
}
