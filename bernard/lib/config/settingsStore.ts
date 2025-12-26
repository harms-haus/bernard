import * as fs from "node:fs";
import * as path from "node:path";

import type Redis from "ioredis";
import { z } from "zod";

import { getRedis } from "../infra/redis";

const DEFAULT_MODEL = "kwaipilot/KAT-coder-v1:free";
const SETTINGS_NAMESPACE = "bernard:settings";

export const ProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["openai", "ollama"]).default("openai"),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastTestedAt: z.string().optional(),
  testStatus: z.enum(["untested", "working", "failed"]).optional(),
  testError: z.string().optional()
});

export const ModelCategorySchema = z.object({
  primary: z.string().min(1),
  providerId: z.string().min(1),
  options: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxTokens: z.number().int().positive().optional()
    })
    .optional(),
  dimension: z.number().int().positive().optional()
});

export const ModelsSettingsSchema = z.object({
  providers: z.array(ProviderSchema).default([]),
  response: ModelCategorySchema,
  router: ModelCategorySchema,
  memory: ModelCategorySchema,
  utility: ModelCategorySchema,
  aggregation: ModelCategorySchema.optional(),
  embedding: ModelCategorySchema.optional()
});

const MemoryServiceSchema = z.object({
  embeddingModel: z.string().optional(),
  embeddingBaseUrl: z.string().url().optional(),
  embeddingApiKey: z.string().optional(),
  indexName: z.string().optional(),
  keyPrefix: z.string().optional(),
  namespace: z.string().optional()
});

const AutomationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  lastRunTime: z.number().optional(),
  lastRunDuration: z.number().optional(),
  runCount: z.number().int().min(0).default(0)
});

const AutomationsSettingsSchema = z.record(z.string(), AutomationSettingsSchema).default({});

function defaultAutomations(): AutomationsSettings {
  return {};
}

const SearchServiceSchema = z.object({
  apiKey: z.string().optional(),
  apiUrl: z.string().url().optional()
});

const WeatherServiceSchema = z.discriminatedUnion("provider", [
  // Open-Meteo: Free, no API key required
  z.object({
    provider: z.literal("open-meteo"),
    forecastUrl: z.string().url().optional(),
    historicalUrl: z.string().url().optional(),
    timeoutMs: z.number().int().positive().optional()
  }),
  // OpenWeatherMap: Requires API key
  z.object({
    provider: z.literal("openweathermap"),
    apiKey: z.string().min(1),
    apiUrl: z.string().url(),
    timeoutMs: z.number().int().positive().optional()
  }),
  // WeatherAPI.com: Requires API key
  z.object({
    provider: z.literal("weatherapi"),
    apiKey: z.string().min(1),
    apiUrl: z.string().url(),
    timeoutMs: z.number().int().positive().optional()
  })
]).default({
  provider: "open-meteo",
  forecastUrl: "https://api.open-meteo.com/v1/forecast",
  historicalUrl: "https://archive-api.open-meteo.com/v1/archive"
});

const GeocodingServiceSchema = z.object({
  url: z.string().url().optional(),
  userAgent: z.string().optional(),
  email: z.string().email().optional(),
  referer: z.string().optional()
});

const HomeAssistantServiceSchema = z.object({
  baseUrl: z.string().url(),
  accessToken: z.string().optional()
});

const PlexServiceSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1)
});

const InfrastructureServiceSchema = z.object({
  redisUrl: z.string().url().optional(),
  queuePrefix: z.string().optional(),
  taskQueueName: z.string().optional(),
  taskWorkerConcurrency: z.number().int().positive().optional(),
  taskMaxRuntimeMs: z.number().int().positive().optional(),
  taskAttempts: z.number().int().positive().optional(),
  taskBackoffMs: z.number().int().positive().optional(),
  taskKeepCompleted: z.number().int().min(0).optional(),
  taskKeepFailed: z.number().int().min(0).optional(),
  taskArchiveAfterDays: z.number().int().positive().optional()
});

export const ServicesSettingsSchema = z.object({
  memory: MemoryServiceSchema.default({}),
  search: SearchServiceSchema.default({}),
  weather: WeatherServiceSchema.default({ provider: "open-meteo" }),
  geocoding: GeocodingServiceSchema.default({}),
  homeAssistant: HomeAssistantServiceSchema.optional(),
  plex: PlexServiceSchema.optional(),
  infrastructure: InfrastructureServiceSchema.default({})
});

const OAuthClientSchema = z.object({
  authUrl: z.string().url(),
  tokenUrl: z.string().url(),
  userInfoUrl: z.string().url(),
  redirectUri: z.string().url(),
  scope: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().optional()
});

export const OAuthSettingsSchema = z.object({
  default: OAuthClientSchema,
  google: OAuthClientSchema,
  github: OAuthClientSchema
});

export const BackupSettingsSchema = z.object({
  debounceSeconds: z.number().int().positive(),
  directory: z.string().min(1),
  retentionDays: z.number().int().positive(),
  retentionCount: z.number().int().positive()
});

const LimitsSettingsSchema = z.object({
  currentRequestMaxTokens: z.number().int().positive().default(8000),
  responseMaxTokens: z.number().int().positive().default(8000)
});

export type Provider = z.infer<typeof ProviderSchema>;
export type ModelCategorySettings = z.infer<typeof ModelCategorySchema>;
export type ModelsSettings = z.infer<typeof ModelsSettingsSchema>;
export type InfrastructureSettings = z.infer<typeof InfrastructureServiceSchema>;
export type ServicesSettings = z.infer<typeof ServicesSettingsSchema>;
export type OAuthSettings = z.infer<typeof OAuthSettingsSchema>;
export type BackupSettings = z.infer<typeof BackupSettingsSchema>;
export type LimitsSettings = z.infer<typeof LimitsSettingsSchema>;

export type AutomationSettings = z.infer<typeof AutomationSettingsSchema>;
export type AutomationsSettings = z.infer<typeof AutomationsSettingsSchema>;

export type BernardSettings = {
  models: ModelsSettings;
  services: ServicesSettings;
  oauth: OAuthSettings;
  backups: BackupSettings;
  limits: LimitsSettings;
  automations: AutomationsSettings;
};

export type Section = keyof BernardSettings;

/**
 * Safely parses JSON and validates it against a Zod schema, returning null on failure.
 */
export const parseJson = <T>(raw: string | null, schema: z.ZodSchema<T>): T | null => {
  if (!raw) return null;
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

/**
 * Normalizes comma-separated or JSON array strings/arrays into a trimmed string array.
 */
export function normalizeList(raw?: string | string[] | null): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (!raw) return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // fall through to comma parsing
  }

  return trimmed
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/**
 * Create a model category configuration from environment variables.
 */
export function defaultModelCategory(envName: string, fallbacks: string[] = []): { primary: string; fallbacks: string[] } {
  const envValue = process.env[envName];
  if (envValue) {
    const models = normalizeList(envValue);
    return {
      primary: models[0] ?? fallbacks[0] ?? DEFAULT_MODEL,
      fallbacks: models.slice(1)
    };
  }

  // Legacy fallback for OPENROUTER_MODEL
  const legacyValue = process.env["OPENROUTER_MODEL"];
  if (legacyValue) {
    const models = normalizeList(legacyValue);
    return {
      primary: models[0] ?? fallbacks[0] ?? DEFAULT_MODEL,
      fallbacks: []
    };
  }

  return {
    primary: fallbacks[0] ?? DEFAULT_MODEL,
    fallbacks: []
  };
}

/**
 * Default model selections for each category, cascading from response models.
 */
export function defaultModels(): ModelsSettings {
  const ollamaProvider: Provider = {
    id: "ollama-provider",
    name: "Ollama",
    type: "openai",
    baseUrl: process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434/v1",
    apiKey: process.env["OLLAMA_API_KEY"] ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestedAt: undefined,
    testStatus: undefined,
    testError: undefined
  };

  const defaultProvider: Provider = {
    id: "default-provider",
    name: "Default Provider",
    type: "openai",
    baseUrl: process.env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1",
    apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestedAt: undefined,
    testStatus: undefined,
    testError: undefined
  };

  const response: ModelCategorySettings = {
    primary: process.env["RESPONSE_MODELS"]?.split(",")[0]?.trim() ?? DEFAULT_MODEL,
    providerId: defaultProvider.id,
    options: { temperature: 0.5 }
  };

  const router: ModelCategorySettings = {
    primary: process.env["ROUTER_MODELS"]?.split(",")[0]?.trim() ?? response.primary,
    providerId: defaultProvider.id,
    options: { temperature: 0 }
  };

  const memory: ModelCategorySettings = {
    primary: process.env["MEMORY_MODELS"]?.split(",")[0]?.trim() ?? response.primary,
    providerId: defaultProvider.id,
    options: { temperature: 0 }
  };

  const utility: ModelCategorySettings = {
    primary: process.env["UTILITY_MODELS"]?.split(",")[0]?.trim() ?? response.primary,
    providerId: defaultProvider.id,
    options: { temperature: 0 }
  };

  const aggregation: ModelCategorySettings = {
    primary: process.env["AGGREGATION_MODELS"]?.split(",")[0]?.trim() ?? response.primary,
    providerId: defaultProvider.id,
    options: { temperature: 0 }
  };

  const embedding: ModelCategorySettings = {
    primary: process.env["EMBEDDING_MODELS"]?.split(",")[0]?.trim() ?? "nomic-embed-text",
    providerId: ollamaProvider.id,
    options: {}
  };

  return {
    providers: [ollamaProvider, defaultProvider],
    response,
    router,
    memory,
    utility,
    aggregation,
    embedding
  };
}

/**
 * Default third-party service configuration sourced from environment variables.
 */
export function defaultServices(): ServicesSettings {
  const services: ServicesSettings = {
    infrastructure: {},
    memory: {
      embeddingModel: process.env["EMBEDDING_MODEL"],
      embeddingBaseUrl: process.env["EMBEDDING_BASE_URL"],
      embeddingApiKey: process.env["EMBEDDING_API_KEY"],
      indexName: process.env["MEMORY_INDEX_NAME"],
      keyPrefix: process.env["MEMORY_KEY_PREFIX"],
      namespace: process.env["MEMORY_NAMESPACE"]
    },
    search: {
      apiKey: process.env["SEARCH_API_KEY"] ?? process.env["BRAVE_API_KEY"],
      apiUrl: process.env["SEARCH_API_URL"]
    },
    weather: {
      provider: "open-meteo",
      forecastUrl: process.env["OPEN_METEO_FORECAST_URL"],
      historicalUrl: process.env["OPEN_METEO_HISTORICAL_URL"],
      timeoutMs: process.env["WEATHER_TIMEOUT_MS"] ? parseInt(process.env["WEATHER_TIMEOUT_MS"]) : undefined
    },
    geocoding: {
      url: process.env["NOMINATIM_URL"],
      userAgent: process.env["NOMINATIM_USER_AGENT"],
      email: process.env["NOMINATIM_EMAIL"],
      referer: process.env["NOMINATIM_REFERER"]
    }
  };

  return services;

  // Add Home Assistant configuration if environment variables are present
  const haBaseUrl = process.env["HA_BASE_URL"];
  const haAccessToken = process.env["HA_ACCESS_TOKEN"];
  if (haBaseUrl) {
    services.homeAssistant = {
      baseUrl: haBaseUrl as string,
      accessToken: haAccessToken
    };
  }

  // Add Plex configuration if environment variables are present
  const plexUrl = process.env["PLEX_URL"];
  const plexToken = process.env["PLEX_TOKEN"];
  if (plexUrl && plexToken) {
    services.plex = {
      baseUrl: plexUrl as string,
      token: plexToken as string
    };
  }

  return services;
}

/**
 * Default limits configuration sourced from environment variables.
 */
export function defaultLimits(): LimitsSettings {
  return {
    currentRequestMaxTokens: process.env["CURRENT_REQUEST_MAX_TOKENS"]
      ? parseInt(process.env["CURRENT_REQUEST_MAX_TOKENS"])
      : 8000,
    responseMaxTokens: process.env["RESPONSE_MAX_TOKENS"]
      ? parseInt(process.env["RESPONSE_MAX_TOKENS"])
      : 8000
  };
}

/**
 * Default OAuth provider configuration derived from shared and provider env vars.
 */
export function defaultOauth(): OAuthSettings {
  const base = {
    authUrl: process.env["OAUTH_AUTH_URL"] ?? "",
    tokenUrl: process.env["OAUTH_TOKEN_URL"] ?? "",
    userInfoUrl: process.env["OAUTH_USERINFO_URL"] ?? "",
    redirectUri: process.env["OAUTH_REDIRECT_URI"] ?? "",
    scope: process.env["OAUTH_SCOPES"] ?? "openid profile",
    clientId: process.env["OAUTH_CLIENT_ID"] ?? "",
    clientSecret: process.env["OAUTH_CLIENT_SECRET"] ?? ""
  };
  return {
    default: base,
    google: {
      authUrl: process.env["OAUTH_GOOGLE_AUTH_URL"] ?? base.authUrl,
      tokenUrl: process.env["OAUTH_GOOGLE_TOKEN_URL"] ?? base.tokenUrl,
      userInfoUrl: process.env["OAUTH_GOOGLE_USERINFO_URL"] ?? base.userInfoUrl,
      redirectUri: process.env["OAUTH_GOOGLE_REDIRECT_URI"] ?? base.redirectUri,
      scope: process.env["OAUTH_GOOGLE_SCOPES"] ?? process.env["OAUTH_SCOPES"] ?? "openid profile email",
      clientId: process.env["OAUTH_GOOGLE_CLIENT_ID"] ?? "",
      clientSecret: process.env["OAUTH_GOOGLE_CLIENT_SECRET"] ?? ""
    },
    github: {
      authUrl: process.env["OAUTH_GITHUB_AUTH_URL"] ?? base.authUrl,
      tokenUrl: process.env["OAUTH_GITHUB_TOKEN_URL"] ?? base.tokenUrl,
      userInfoUrl: process.env["OAUTH_GITHUB_USERINFO_URL"] ?? base.userInfoUrl,
      redirectUri: process.env["OAUTH_GITHUB_REDIRECT_URI"] ?? base.redirectUri,
      scope: process.env["OAUTH_GITHUB_SCOPES"] ?? process.env["OAUTH_SCOPES"] ?? "read:user user:email",
      clientId: process.env["OAUTH_GITHUB_CLIENT_ID"] ?? "",
      clientSecret: process.env["OAUTH_GITHUB_CLIENT_SECRET"] ?? ""
    }
  };
}

/**
 * Default backup settings with guarded numeric parsing and sensible fallbacks.
 */
export function defaultBackups(): BackupSettings {
  const toNumber = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    debounceSeconds: toNumber(process.env["BACKUP_DEBOUNCE_SECONDS"], 60),
    directory: process.env["BACKUP_DIR"] ?? path.join(process.cwd(), "backups"),
    retentionDays: toNumber(process.env["BACKUP_RETENTION_DAYS"], 14),
    retentionCount: toNumber(process.env["BACKUP_RETENTION_COUNT"], 20)
  };
}

/**
 * Ensures a directory exists on disk, creating it recursively when missing.
 */
export function ensureDirectory(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class SettingsStore {
  private readonly namespace: string;
  private readonly onChange: ((section: Section) => void) | undefined;

  constructor(
    private readonly redis: Pick<Redis, "get" | "set"> = getRedis(),
    opts: { namespace?: string; onChange?: (section: Section) => void } = {}
  ) {
    this.namespace = opts.namespace ?? SETTINGS_NAMESPACE;
    this.onChange = opts.onChange;
  }

  private sectionKey(section: Section) {
    return `${this.namespace}:${section}`;
  }

  private async readSection<T>(section: Section, schema: z.ZodSchema<T>, fallback: () => T): Promise<T> {
    const raw = await this.redis.get(this.sectionKey(section));
    const parsed = parseJson(raw, schema);
    if (parsed) return parsed;
    const defaults = fallback();
    return defaults;
  }

  private async writeSection<T>(section: Section, schema: z.ZodSchema<T>, value: T): Promise<T> {
    const parsed = schema.parse(value);
    await this.redis.set(this.sectionKey(section), JSON.stringify(parsed));
    if (this.onChange) this.onChange(section);
    return parsed;
  }

  async getModels(): Promise<ModelsSettings> {
    return this.readSection("models", ModelsSettingsSchema, defaultModels);
  }

  async setModels(models: ModelsSettings): Promise<ModelsSettings> {
    return this.writeSection("models", ModelsSettingsSchema, models);
  }

  async getProviders(): Promise<Provider[]> {
    const models = await this.getModels();
    return models.providers ?? [];
  }

  async setProviders(providers: Provider[]): Promise<Provider[]> {
    const models = await this.getModels();
    const updatedModels = { ...models, providers };
    await this.setModels(updatedModels);
    return providers;
  }

  async addProvider(provider: Omit<Provider, "id" | "createdAt" | "updatedAt">): Promise<Provider> {
    const providers = await this.getProviders();
    const newProvider: Provider = {
      ...provider,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: provider.type || "openai"
    };
    const updatedProviders = [...providers, newProvider];
    await this.setProviders(updatedProviders);
    return newProvider;
  }

  async updateProvider(id: string, updates: Partial<Omit<Provider, "id" | "createdAt">>): Promise<Provider | null> {
    const providers = await this.getProviders();
    const index = providers.findIndex(p => p.id === id);
    if (index === -1) return null;

    const updatedProvider = {
      ...providers[index],
      ...updates,
      updatedAt: new Date().toISOString()
    } as Provider;
    providers[index] = updatedProvider;
    await this.setProviders(providers);
    return updatedProvider;
  }

  async deleteProvider(id: string): Promise<boolean> {
    const providers = await this.getProviders();
    const filteredProviders = providers.filter(p => p.id !== id);
    if (filteredProviders.length === providers.length) return false;

    await this.setProviders(filteredProviders);

    // Update any model categories that reference this provider
    const models = await this.getModels();
    const updatedModels = { ...models };
    const categories: Array<keyof Omit<ModelsSettings, "providers">> = ["response", "router", "memory", "utility", "aggregation"];

    for (const category of categories) {
      if (updatedModels[category] && updatedModels[category].providerId === id) {
        // Set to first available provider or clear if none
        updatedModels[category] = {
          ...updatedModels[category],
          providerId: filteredProviders[0]?.id ?? ""
        };
      }
    }

    await this.setModels(updatedModels);
    return true;
  }

  async testProviderConnection(provider: Provider): Promise<{ status: "working" | "failed"; error?: string; modelCount?: number }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${provider.baseUrl}/models`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json() as { data?: unknown[] };
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error("Invalid models response format");
      }

      return {
        status: "working",
        modelCount: data.data.length
      };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async getServices(): Promise<ServicesSettings> {
    const defaults = defaultServices();
    const parsed = await this.readSection("services", ServicesSettingsSchema, () => defaults);
    return parsed;
  }

  async setServices(services: ServicesSettings): Promise<ServicesSettings> {
    return this.writeSection("services", ServicesSettingsSchema, services);
  }

  async getOAuth(): Promise<OAuthSettings> {
    return this.readSection("oauth", OAuthSettingsSchema, defaultOauth);
  }

  async setOAuth(oauth: OAuthSettings): Promise<OAuthSettings> {
    return this.writeSection("oauth", OAuthSettingsSchema, oauth);
  }

  async getBackups(): Promise<BackupSettings> {
    const backups = await this.readSection("backups", BackupSettingsSchema, defaultBackups);
    ensureDirectory(backups.directory);
    return backups;
  }

  async setBackups(backups: BackupSettings): Promise<BackupSettings> {
    const parsed = await this.writeSection("backups", BackupSettingsSchema, backups);
    ensureDirectory(parsed.directory);
    return parsed;
  }

  async getLimits(): Promise<LimitsSettings> {
    return this.readSection("limits", LimitsSettingsSchema, defaultLimits);
  }

  async setLimits(limits: LimitsSettings): Promise<LimitsSettings> {
    return this.writeSection("limits", LimitsSettingsSchema, limits);
  }

  async getAutomations(): Promise<AutomationsSettings> {
    return this.readSection("automations", AutomationsSettingsSchema, defaultAutomations);
  }

  async setAutomations(automations: AutomationsSettings): Promise<AutomationsSettings> {
    return this.writeSection("automations", AutomationsSettingsSchema, automations);
  }

  async getAutomationSettings(automationId: string): Promise<AutomationSettings> {
    const automations = await this.getAutomations();
    return automations[automationId] || {
      enabled: true,
      runCount: 0
    };
  }

  async setAutomationSettings(automationId: string, settings: AutomationSettings): Promise<AutomationSettings> {
    const automations = await this.getAutomations();
    const updatedAutomations = {
      ...automations,
      [automationId]: settings
    };
    await this.setAutomations(updatedAutomations);
    return settings;
  }

  async getAll(): Promise<BernardSettings> {
    const [models, services, oauth, backups, limits, automations] = await Promise.all([
      this.getModels(),
      this.getServices(),
      this.getOAuth(),
      this.getBackups(),
      this.getLimits(),
      this.getAutomations()
    ]);
    return { models, services, oauth, backups, limits, automations };
  }

}

