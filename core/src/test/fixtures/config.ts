import type { ProviderSchema, ModelsSettingsSchema, ServicesSettingsSchema } from '@/lib/config/models'

export function mockProviderSchema(overrides: Partial<ProviderSchema> = {}): ProviderSchema {
  return {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: 'mock-api-key-12345',
    baseUrl: 'https://api.openai.com/v1',
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

export function mockModelsSettings(overrides: Partial<ModelsSettingsSchema> = {}): ModelsSettingsSchema {
  return {
    primary: 'openai|gpt-4',
    models: [
      {
        id: 'openai|gpt-4',
        providerId: 'openai',
        name: 'GPT-4',
        type: 'chat',
        contextLength: 128000,
      },
    ],
    ...overrides,
  }
}

export function mockServicesSettings(overrides: Partial<ServicesSettingsSchema> = {}): ServicesSettingsSchema {
  return {
    bernardAgent: { enabled: true },
    bernardUi: { enabled: true },
    whisper: { enabled: true },
    kokoro: { enabled: true },
    ...overrides,
  }
}
