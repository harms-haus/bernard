import * as fs from "node:fs";
import * as path from "node:path";
import type Redis from "ioredis";
import type { z } from "zod";
import { appSettings } from "@shared/config/appSettings";
import type { Section, BernardSettings, ModelsSettings, Provider, ServicesSettings, OAuthSettings, BackupSettings, LimitsSettings, AutomationsSettings, AutomationSettings } from "@shared/config/appSettings";
import { getRedis } from "@shared/infra/redis";

export { 
  ProviderSchema, 
  ModelCategorySchema, 
  ModelsSettingsSchema, 
  ServicesSettingsSchema, 
  OAuthSettingsSchema, 
  BackupSettingsSchema,
  type Provider,
  type ModelCategorySettings,
  type ModelsSettings,
  type ServicesSettings,
  type OAuthSettings,
  type BackupSettings,
  type LimitsSettings,
  type AutomationSettings,
  type AutomationsSettings,
  type BernardSettings,
  type Section
} from "@shared/config/appSettings";

// Initialize appSettings with root .env path
appSettings.loadEnv(path.join(process.cwd(), "../../.env"));

export class SettingsStore {
  private _redisInstance: Pick<Redis, "get" | "set"> | null = null;
  
  constructor(
    _redis?: Pick<Redis, "get" | "set">,
    _opts: { namespace?: string; onChange?: (section: Section) => void } = {}
  ) {
    // Store redis instance if provided, otherwise lazy-load on first use
    if (_redis) {
      this._redisInstance = _redis;
    }
    // appSettings uses the same redis and namespace by default
  }

  private get redis(): Pick<Redis, "get" | "set"> {
    if (!this._redisInstance) {
      this._redisInstance = getRedis();
    }
    return this._redisInstance;
  }

  async getModels(): Promise<ModelsSettings> {
    return appSettings.getModels();
  }

  async setModels(models: ModelsSettings): Promise<ModelsSettings> {
    const redis = getRedis();
    await redis.set(`bernard:settings:models`, JSON.stringify(models));
    return models;
  }

  async getProviders(): Promise<Provider[]> {
    const models = await this.getModels();
    return models.providers ?? [];
  }

  async getServices(): Promise<ServicesSettings> {
    return appSettings.getServices();
  }

  async setServices(services: ServicesSettings): Promise<ServicesSettings> {
    const redis = getRedis();
    await redis.set(`bernard:settings:services`, JSON.stringify(services));
    return services;
  }

  async getOAuth(): Promise<OAuthSettings> {
    return appSettings.getOAuth();
  }

  async getBackups(): Promise<BackupSettings> {
    return appSettings.getBackups();
  }

  async getLimits(): Promise<LimitsSettings> {
    return appSettings.getLimits();
  }

  async getAutomations(): Promise<AutomationsSettings> {
    return appSettings.getAutomations();
  }

  async getAll(): Promise<BernardSettings> {
    return appSettings.getAll();
  }

  async testProviderConnection(provider: Provider): Promise<{ status: "working" | "failed"; error?: string; modelCount?: number }> {
    return appSettings.testProviderConnection(provider);
  }

  async updateProvider(id: string, updates: Partial<Provider>): Promise<Provider | null> {
    return appSettings.updateProvider(id, updates);
  }

  async deleteProvider(id: string): Promise<boolean> {
    return appSettings.deleteProvider(id);
  }

  async addProvider(provider: Omit<Provider, "id" | "createdAt" | "updatedAt">): Promise<Provider> {
    return appSettings.addProvider(provider);
  }

  async setBackups(data: BackupSettings): Promise<void> {
    return appSettings.setBackups(data);
  }

  async setOAuth(data: OAuthSettings): Promise<void> {
    return appSettings.setOAuth(data);
  }

  async getAutomationSettings(name: string): Promise<AutomationSettings> {
    return appSettings.getAutomationSettings(name);
  }

  async setAutomationSettings(name: string, settings: AutomationSettings): Promise<void> {
    return appSettings.setAutomationSettings(name, settings);
  }
}

export const ensureDirectory = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const parseJson = <T>(raw: string | null, schema: z.ZodSchema<T>): T | null => {
  if (!raw) return null;
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

export function normalizeList(raw?: string | string[] | null): string[] {
  return appSettings.normalizeList(raw);
}

export function defaultModels(): ModelsSettings {
  return appSettings.getDefaultModels();
}

export function defaultServices(): ServicesSettings {
  return appSettings.getDefaultServices();
}

export function defaultBackups(): BackupSettings {
  return appSettings.getDefaultBackups();
}

export function defaultOauth(): OAuthSettings {
  return appSettings.getDefaultOauth();
}
