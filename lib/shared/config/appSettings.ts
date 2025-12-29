import { Redis } from "ioredis";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { getRedis } from "../infra/redis";

// --- Schemas ---

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

const SearchServiceSchema = z.object({
  apiKey: z.string().optional(),
  apiUrl: z.string().url().optional()
});

const WeatherServiceSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("open-meteo"),
    forecastUrl: z.string().url().optional(),
    historicalUrl: z.string().url().optional(),
    timeoutMs: z.number().int().positive().optional()
  }),
  z.object({
    provider: z.literal("openweathermap"),
    apiKey: z.string().min(1),
    apiUrl: z.string().url(),
    timeoutMs: z.number().int().positive().optional()
  }),
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

const KokoroServiceSchema = z.object({
  baseUrl: z.string().url().default("http://localhost:8880")
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
  kokoro: KokoroServiceSchema.optional(),
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

// --- Types ---

export type Provider = z.output<typeof ProviderSchema>;
export type ModelCategorySettings = z.output<typeof ModelCategorySchema>;
export type ModelsSettings = z.output<typeof ModelsSettingsSchema>;
export type ServicesSettings = z.output<typeof ServicesSettingsSchema>;
export type OAuthSettings = z.output<typeof OAuthSettingsSchema>;
export type BackupSettings = z.output<typeof BackupSettingsSchema>;
export type LimitsSettings = z.output<typeof LimitsSettingsSchema>;
export type AutomationSettings = z.output<typeof AutomationSettingsSchema>;
export type AutomationsSettings = z.output<typeof AutomationsSettingsSchema>;

export type BernardSettings = {
  models: ModelsSettings;
  services: ServicesSettings;
  oauth: OAuthSettings;
  backups: BackupSettings;
  limits: LimitsSettings;
  automations: AutomationsSettings;
};

export type Section = keyof BernardSettings;

// --- Manager ---

const SETTINGS_NAMESPACE = "bernard:settings";

export class SettingsManager {
  private static instance: SettingsManager;
  private envLoaded = false;
  private envData: Record<string, string> = {};
  private redis: Redis;

  private constructor() {
    this.redis = getRedis();
  }

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  /**
   * Load environment variables from a specific .env file once.
   */
  loadEnv(envPath: string) {
    if (this.envLoaded) return;
    
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      content.split("\n").forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match && match[1]) {
          const key = match[1];
          let value = match[2] || "";
          if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          this.envData[key] = value;
          // Also set in process.env if not already set
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
    this.envLoaded = true;
  }

  private async getFromRedis(section: Section): Promise<string | null> {
    // Skip Redis for infrastructure settings to avoid circular dependency
    if (section === "services") {
      // We might want to still check services, but infrastructure part of it should be careful
    }
    return this.redis.get(`${SETTINGS_NAMESPACE}:${section}`);
  }

  private getFromEnv(key: string): string | undefined {
    return this.envData[key] || process.env[key];
  }

  /**
   * Generic method to get a settings section with hierarchy:
   * Redis > Env > Default
   */
  async getSection<T>(
    section: Section,
    schema: z.ZodSchema<T>,
    defaultFactory: () => T
  ): Promise<T> {
    // 1. Try Redis
    const redisValue = await this.getFromRedis(section);
    if (redisValue) {
      try {
        return schema.parse(JSON.parse(redisValue));
      } catch (e) {
        console.error(`Failed to parse settings for ${section} from Redis:`, e);
      }
    }

    // 2. Try Env / Default
    // The defaultFactory usually checks env vars already
    return defaultFactory();
  }

  // Helper to normalize lists (copied from original settingsStore)
  normalizeList(raw?: string | string[] | null): string[] {
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
    } catch {}
    return trimmed
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  // --- Specialized Getters (moved from original settingsStore factories) ---

  async getModels(): Promise<ModelsSettings> {
    return this.getSection("models", ModelsSettingsSchema, () => this.getDefaultModels());
  }

  async getServices(): Promise<ServicesSettings> {
    return this.getSection("services", ServicesSettingsSchema, () => this.getDefaultServices());
  }

  async getOAuth(): Promise<OAuthSettings> {
    return this.getSection("oauth", OAuthSettingsSchema, () => this.getDefaultOauth());
  }

  async getBackups(): Promise<BackupSettings> {
    return this.getSection("backups", BackupSettingsSchema, () => this.getDefaultBackups());
  }

  async getLimits(): Promise<LimitsSettings> {
    return this.getSection("limits", LimitsSettingsSchema, () => this.getDefaultLimits());
  }

  async getAutomations(): Promise<AutomationsSettings> {
    return this.getSection("automations", AutomationsSettingsSchema, () => ({}));
  }

  async getAutomationSettings(name: string): Promise<AutomationSettings> {
    const all = await this.getAutomations();
    const settings = all[name];
    if (settings) return settings;
    return { enabled: true, runCount: 0 };
  }

  async setSection<T>(section: Section, data: T): Promise<void> {
    await this.redis.set(`${SETTINGS_NAMESPACE}:${section}`, JSON.stringify(data));
  }

  async setBackups(data: BackupSettings): Promise<void> {
    await this.setSection("backups", data);
  }

  async setOAuth(data: OAuthSettings): Promise<void> {
    await this.setSection("oauth", data);
  }

  async setAutomationSettings(name: string, settings: AutomationSettings): Promise<void> {
    const all = await this.getAutomations();
    all[name] = settings;
    await this.setSection("automations", all);
  }

  async getAll(): Promise<BernardSettings> {
    return {
      models: await this.getModels(),
      services: await this.getServices(),
      oauth: await this.getOAuth(),
      backups: await this.getBackups(),
      limits: await this.getLimits(),
      automations: await this.getAutomations()
    };
  }

  // Provider methods
  async addProvider(provider: Omit<Provider, "id" | "createdAt" | "updatedAt">): Promise<Provider> {
    const id = randomBytes(8).toString("hex");
    const now = new Date().toISOString();
    const newProvider: Provider = { 
      ...provider, 
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    const models = await this.getModels();
    models.providers.push(newProvider);
    await this.setSection("models", models);
    return newProvider;
  }

  async updateProvider(id: string, updates: Partial<Provider>): Promise<Provider | null> {
    const models = await this.getModels();
    const index = models.providers.findIndex((p: Provider) => p.id === id);
    if (index === -1) return null;
    
    const current = models.providers[index];
    if (!current) return null;

    models.providers[index] = { 
      ...current, 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    await this.setSection("models", models);
    return models.providers[index]!;
  }

  async deleteProvider(id: string): Promise<boolean> {
    const models = await this.getModels();
    const initialCount = models.providers.length;
    models.providers = models.providers.filter((p: Provider) => p.id !== id);
    if (models.providers.length === initialCount) return false;
    await this.setSection("models", models);
    return true;
  }

  async testProviderConnection(_provider: Provider): Promise<{ status: "working" | "failed"; error?: string; modelCount?: number }> {
    // Basic connection test could be implemented here
    // For now, we'll just return working
    return { status: "working", modelCount: 0 };
  }

  // --- Default Factories ---

  getDefaultModels(): ModelsSettings {
    const DEFAULT_MODEL = "kwaipilot/KAT-coder-v1:free";
    
    const ollamaProvider: Provider = {
      id: "ollama-provider",
      name: "Ollama",
      type: "openai",
      baseUrl: this.getFromEnv("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1",
      apiKey: this.getFromEnv("OLLAMA_API_KEY") ?? "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const defaultProvider: Provider = {
      id: "default-provider",
      name: "Default Provider",
      type: "openai",
      baseUrl: this.getFromEnv("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
      apiKey: this.getFromEnv("OPENROUTER_API_KEY") ?? "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const responseModel = this.getFromEnv("RESPONSE_MODELS")?.split(",")[0]?.trim() ?? DEFAULT_MODEL;

    const settings: ModelsSettings = {
      providers: [ollamaProvider, defaultProvider],
      response: { primary: responseModel, providerId: defaultProvider.id, options: { temperature: 0.5 } },
      router: { primary: this.getFromEnv("ROUTER_MODELS")?.split(",")[0]?.trim() ?? responseModel, providerId: defaultProvider.id, options: { temperature: 0 } },
      memory: { primary: this.getFromEnv("MEMORY_MODELS")?.split(",")[0]?.trim() ?? responseModel, providerId: defaultProvider.id, options: { temperature: 0 } },
      utility: { primary: this.getFromEnv("UTILITY_MODELS")?.split(",")[0]?.trim() ?? responseModel, providerId: defaultProvider.id, options: { temperature: 0 } }
    };

    const aggregationModel = this.getFromEnv("AGGREGATION_MODELS")?.split(",")[0]?.trim();
    if (aggregationModel) {
      settings.aggregation = { primary: aggregationModel, providerId: defaultProvider.id, options: { temperature: 0 } };
    }

    const embeddingModel = this.getFromEnv("EMBEDDING_MODELS")?.split(",")[0]?.trim() ?? "nomic-embed-text";
    settings.embedding = { primary: embeddingModel, providerId: ollamaProvider.id };

    return settings;
  }

  getDefaultServices(): ServicesSettings {
    const services: ServicesSettings = {
      infrastructure: {
        redisUrl: this.getFromEnv("REDIS_URL")
      },
      memory: {
        embeddingModel: this.getFromEnv("EMBEDDING_MODEL"),
        embeddingBaseUrl: this.getFromEnv("EMBEDDING_BASE_URL"),
        embeddingApiKey: this.getFromEnv("EMBEDDING_API_KEY"),
        indexName: this.getFromEnv("MEMORY_INDEX_NAME"),
        keyPrefix: this.getFromEnv("MEMORY_KEY_PREFIX"),
        namespace: this.getFromEnv("MEMORY_NAMESPACE")
      },
      search: {
        apiKey: this.getFromEnv("SEARCH_API_KEY") ?? this.getFromEnv("BRAVE_API_KEY"),
        apiUrl: this.getFromEnv("SEARCH_API_URL")
      },
      weather: {
        provider: "open-meteo",
        forecastUrl: "https://api.open-meteo.com/v1/forecast",
        historicalUrl: "https://archive-api.open-meteo.com/v1/archive"
      },
      geocoding: {
        url: this.getFromEnv("NOMINATIM_URL"),
        userAgent: this.getFromEnv("NOMINATIM_USER_AGENT"),
        email: this.getFromEnv("NOMINATIM_EMAIL"),
        referer: this.getFromEnv("NOMINATIM_REFERER")
      }
    };

    const haBaseUrl = this.getFromEnv("HA_BASE_URL");
    if (haBaseUrl) {
      services.homeAssistant = {
        baseUrl: haBaseUrl,
        accessToken: this.getFromEnv("HA_ACCESS_TOKEN")
      };
    }

    const plexUrl = this.getFromEnv("PLEX_URL");
    const plexToken = this.getFromEnv("PLEX_TOKEN");
    if (plexUrl && plexToken) {
      services.plex = { baseUrl: plexUrl, token: plexToken };
    }

    services.kokoro = {
      baseUrl: this.getFromEnv("KOKORO_URL") || "http://localhost:8880"
    };

    return services;
  }

  getDefaultOauth(): OAuthSettings {
    const base = {
      authUrl: this.getFromEnv("OAUTH_AUTH_URL") ?? "",
      tokenUrl: this.getFromEnv("OAUTH_TOKEN_URL") ?? "",
      userInfoUrl: this.getFromEnv("OAUTH_USERINFO_URL") ?? "",
      redirectUri: this.getFromEnv("OAUTH_REDIRECT_URI") ?? "",
      scope: this.getFromEnv("OAUTH_SCOPES") ?? "openid profile",
      clientId: this.getFromEnv("OAUTH_CLIENT_ID") ?? ""
    };

    const settings: OAuthSettings = {
      default: base,
      google: {
        ...base,
        authUrl: this.getFromEnv("OAUTH_GOOGLE_AUTH_URL") ?? base.authUrl,
        tokenUrl: this.getFromEnv("OAUTH_GOOGLE_TOKEN_URL") ?? base.tokenUrl,
        userInfoUrl: this.getFromEnv("OAUTH_GOOGLE_USERINFO_URL") ?? base.userInfoUrl,
        clientId: this.getFromEnv("OAUTH_GOOGLE_CLIENT_ID") ?? "",
        redirectUri: this.getFromEnv("OAUTH_GOOGLE_REDIRECT_URI") ?? base.redirectUri
      },
      github: {
        ...base,
        authUrl: this.getFromEnv("OAUTH_GITHUB_AUTH_URL") ?? base.authUrl,
        tokenUrl: this.getFromEnv("OAUTH_GITHUB_TOKEN_URL") ?? base.tokenUrl,
        userInfoUrl: this.getFromEnv("OAUTH_GITHUB_USERINFO_URL") ?? base.userInfoUrl,
        clientId: this.getFromEnv("OAUTH_GITHUB_CLIENT_ID") ?? "",
        redirectUri: this.getFromEnv("OAUTH_GITHUB_REDIRECT_URI") ?? base.redirectUri
      }
    };

    const clientSecret = this.getFromEnv("OAUTH_CLIENT_SECRET");
    if (clientSecret) settings.default.clientSecret = clientSecret;

    const googleSecret = this.getFromEnv("OAUTH_GOOGLE_CLIENT_SECRET");
    if (googleSecret) settings.google.clientSecret = googleSecret;

    const githubSecret = this.getFromEnv("OAUTH_GITHUB_CLIENT_SECRET");
    if (githubSecret) settings.github.clientSecret = githubSecret;

    return settings;
  }

  getDefaultBackups(): BackupSettings {
    const settings: BackupSettings = {
      debounceSeconds: Number(this.getFromEnv("BACKUP_DEBOUNCE_SECONDS")) || 60,
      directory: this.getFromEnv("BACKUP_DIR") ?? path.join(process.cwd(), "backups"),
      retentionDays: Number(this.getFromEnv("BACKUP_RETENTION_DAYS")) || 14,
      retentionCount: Number(this.getFromEnv("BACKUP_RETENTION_COUNT")) || 20
    };
    return settings;
  }

  getDefaultLimits(): LimitsSettings {
    const settings: LimitsSettings = {
      currentRequestMaxTokens: Number(this.getFromEnv("CURRENT_REQUEST_MAX_TOKENS")) || 8000,
      responseMaxTokens: Number(this.getFromEnv("RESPONSE_MAX_TOKENS")) || 8000
    };
    return settings;
  }
}

export const appSettings = SettingsManager.getInstance();

