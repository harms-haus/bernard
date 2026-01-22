import * as fs from 'node:fs'
import * as path from 'node:path'
import type Redis from 'ioredis'
import type { z } from 'zod'
import type { SettingsManagerCore, Section, BernardSettings, ModelsSettings, Provider, ServicesSettings, OAuthSettings, BackupSettings, LimitsSettings, AutomationsSettings, AutomationSettings } from '@/lib/config/appSettings'
import { SettingsManagerCore as CoreClass } from '@/lib/config/appSettings'

export {
  ProviderSchema,
  ModelsSettingsSchema,
  ServicesSettingsSchema,
  OAuthSettingsSchema,
  BackupSettingsSchema,
  LimitsSettingsSchema,
  OverseerrServiceSchema,
  AgentModelRoleSchema,
  AgentModelsSchema,
  UtilityModelSchema,
  type Provider,
  type UtilityModelSettings,
  type AgentModelRoleSettings,
  type AgentModelSettings,
  type ModelsSettings,
  type ServicesSettings,
  type OverseerrServiceSettings,
  type OAuthSettings,
  type BackupSettings,
  type LimitsSettings,
  type AutomationSettings,
  type AutomationsSettings,
  type BernardSettings,
  type Section
} from '@/lib/config/appSettings'

export interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<string>
}

export class SettingsStoreCore {
  private _settingsManager: SettingsManagerCore | null = null
  private _redisInstance: Pick<Redis, "get" | "set"> | null = null
  
  constructor(
    settingsManager?: SettingsManagerCore,
    redis?: Pick<Redis, "get" | "set">,
    protected _opts: { namespace?: string; onChange?: (section: Section) => void } = {}
  ) {
    this._settingsManager = settingsManager || null
    if (redis) {
      this._redisInstance = redis
    }
  }

  protected get settingsManager(): SettingsManagerCore {
    if (!this._settingsManager) {
      throw new Error('SettingsStoreCore requires SettingsManagerCore to be provided in constructor for testing, or use initializeSettingsStore() in production.')
    }
    return this._settingsManager
  }

  protected get redis(): Pick<Redis, "get" | "set"> {
    if (!this._redisInstance) {
      throw new Error('Redis instance not available. Provide redis in constructor or ensure initializeSettingsStore() is called.')
    }
    return this._redisInstance
  }

  async getModels(): Promise<ModelsSettings> {
    return this.settingsManager.getModels()
  }

  async setModels(models: ModelsSettings): Promise<ModelsSettings> {
    return this.settingsManager.setModels(models)
  }

  async getProviders(): Promise<Provider[]> {
    const models = await this.getModels()
    return models.providers ?? []
  }

  async getServices(): Promise<ServicesSettings> {
    return this.settingsManager.getServices()
  }

  async setServices(services: ServicesSettings): Promise<ServicesSettings> {
    return this.settingsManager.setServices(services)
  }

  async getOAuth(): Promise<OAuthSettings> {
    return this.settingsManager.getOAuth()
  }

  async getBackups(): Promise<BackupSettings> {
    return this.settingsManager.getBackups()
  }

  async getLimits(): Promise<LimitsSettings> {
    return this.settingsManager.getLimits()
  }

  async getAutomations(): Promise<AutomationsSettings> {
    return this.settingsManager.getAutomations()
  }

  async getAll(): Promise<BernardSettings> {
    return this.settingsManager.getAll()
  }

  async testProviderConnection(provider: Provider): Promise<{ status: "working" | "failed"; error?: string; modelCount?: number }> {
    return this.settingsManager.testProviderConnection(provider)
  }

  async updateProvider(id: string, updates: Partial<Provider>): Promise<Provider | null> {
    return this.settingsManager.updateProvider(id, updates)
  }

  async deleteProvider(id: string): Promise<boolean> {
    return this.settingsManager.deleteProvider(id)
  }

  async addProvider(provider: Omit<Provider, "id" | "createdAt" | "updatedAt">): Promise<Provider> {
    return this.settingsManager.addProvider(provider)
  }

  async setBackups(data: BackupSettings): Promise<void> {
    return this.settingsManager.setBackups(data)
  }

  async setLimits(data: LimitsSettings): Promise<void> {
    return this.settingsManager.setLimits(data)
  }

  async setOAuth(data: OAuthSettings): Promise<void> {
    return this.settingsManager.setOAuth(data)
  }

  async getAutomationSettings(name: string): Promise<AutomationSettings> {
    return this.settingsManager.getAutomationSettings(name)
  }

  async setAutomationSettings(name: string, settings: AutomationSettings): Promise<void> {
    return this.settingsManager.setAutomationSettings(name, settings)
  }

  normalizeList(raw?: string | string[] | null): string[] {
    return this.settingsManager.normalizeList(raw)
  }

  getDefaultModels(): ModelsSettings {
    return this.settingsManager.getDefaultModels()
  }

  getDefaultServices(): ServicesSettings {
    return this.settingsManager.getDefaultServices()
  }

  getDefaultBackups(): BackupSettings {
    return this.settingsManager.getDefaultBackups()
  }

  getDefaultOauth(): OAuthSettings {
    return this.settingsManager.getDefaultOauth()
  }
}

let singletonInstance: SettingsStoreCore | null = null
let internalSettingsStore: SettingsStoreCore | null = null

export function getSettingsStore(): SettingsStoreCore {
  if (!singletonInstance) {
    throw new Error('SettingsStore not initialized. Use SettingsStoreCore directly in tests or call initializeSettingsStore() in production.')
  }
  return singletonInstance
}

export async function initializeSettingsStore(settingsManager?: SettingsManagerCore, redis?: Pick<Redis, "get" | "set">): Promise<SettingsStoreCore> {
  if (singletonInstance) {
    return singletonInstance
  }

  const envPath = path.resolve(process.cwd(), '.env')

  const defaultRedis: Pick<Redis, "get" | "set"> = {
    get: async () => null,
    set: async () => 'OK',
  }

  const core = settingsManager || new CoreClass(redis as RedisClient || defaultRedis)
  core.loadEnv(envPath)

  singletonInstance = new SettingsStoreCore(core, redis as Pick<Redis, "get" | "set"> || defaultRedis)
  internalSettingsStore = singletonInstance
  return singletonInstance
}

export function resetSettingsStore() {
  singletonInstance = null
  internalSettingsStore = null
}

export const settingsStore: SettingsStoreCore = new Proxy({} as SettingsStoreCore, {
  get(_target, prop) {
    if (prop === 'then') {
      return undefined
    }
    if (!internalSettingsStore) {
      throw new Error('settingsStore requires initialization. Call initializeSettingsStore() before use.')
    }
    const value = (internalSettingsStore as any)[prop]
    if (typeof value === 'function') {
      return value.bind(internalSettingsStore)
    }
    return value
  },
  set(_target, prop, value) {
    if (!internalSettingsStore) {
      throw new Error('settingsStore requires initialization. Call initializeSettingsStore() before use.')
    }
    (internalSettingsStore as any)[prop] = value
    return true
  },
})

export const ensureDirectory = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export const parseJson = <T>(raw: string | null, schema: z.ZodSchema<T>): T | null => {
  if (!raw) return null
  try {
    return schema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function normalizeList(raw?: string | string[] | null): string[] {
  if (singletonInstance) {
    return singletonInstance.normalizeList(raw)
  }
  throw new Error('settingsStore not initialized. Call initializeSettingsStore() before use.')
}

export function defaultModels(): ModelsSettings {
  if (singletonInstance) {
    return singletonInstance.getDefaultModels()
  }
  throw new Error('settingsStore not initialized. Call initializeSettingsStore() before use.')
}

export function defaultServices(): ServicesSettings {
  if (singletonInstance) {
    return singletonInstance.getDefaultServices()
  }
  throw new Error('settingsStore not initialized. Call initializeSettingsStore() before use.')
}

export function defaultBackups(): BackupSettings {
  if (singletonInstance) {
    return singletonInstance.getDefaultBackups()
  }
  throw new Error('settingsStore not initialized. Call initializeSettingsStore() before use.')
}

export function defaultOauth(): OAuthSettings {
  if (singletonInstance) {
    return singletonInstance.getDefaultOauth()
  }
  throw new Error('settingsStore not initialized. Call initializeSettingsStore() before use.')
}

// Backward compatibility aliases
export const SettingsStore = SettingsStoreCore
