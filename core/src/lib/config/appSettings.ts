import { z } from "zod"
import * as fs from "node:fs"
import * as path from "node:path"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["openai", "ollama"]),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastTestedAt: z.string().optional(),
  testStatus: z.enum(["untested", "working", "failed"]).optional(),
  testError: z.string().optional()
})

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
})

export const ModelsSettingsSchema = z.object({
  providers: z.array(ProviderSchema),
  response: ModelCategorySchema,
  router: ModelCategorySchema,
  memory: ModelCategorySchema,
  utility: ModelCategorySchema,
  aggregation: ModelCategorySchema.optional(),
  embedding: ModelCategorySchema.optional()
})

const MemoryServiceSchema = z.object({
  embeddingModel: z.string().optional(),
  embeddingBaseUrl: z.string().url().optional(),
  embeddingApiKey: z.string().optional(),
  indexName: z.string().optional(),
  keyPrefix: z.string().optional(),
  namespace: z.string().optional()
})

const AutomationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  lastRunTime: z.number().optional(),
  lastRunDuration: z.number().optional(),
  runCount: z.number().int().min(0).default(0)
})

const AutomationsSettingsSchema = z.record(z.string(), AutomationSettingsSchema)

const SearchServiceSchema = z.object({
  apiKey: z.string().optional(),
  apiUrl: z.string().url().optional()
})

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
])

const GeocodingServiceSchema = z.object({
  url: z.string().url().optional(),
  userAgent: z.string().optional(),
  email: z.string().email().optional(),
  referer: z.string().optional()
})

const HomeAssistantServiceSchema = z.object({
  baseUrl: z.string().url(),
  accessToken: z.string().optional()
})

const PlexServiceSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1)
})

const KokoroServiceSchema = z.object({
  baseUrl: z.string().url().default("http://localhost:8880")
})

const TtsServiceSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional()
})

const SttServiceSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional()
})

export const OverseerrServiceSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1)
})

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
})

export const ServicesSettingsSchema = z.object({
  memory: MemoryServiceSchema,
  search: SearchServiceSchema,
  weather: WeatherServiceSchema,
  geocoding: GeocodingServiceSchema,
  homeAssistant: HomeAssistantServiceSchema.optional(),
  plex: PlexServiceSchema.optional(),
  kokoro: KokoroServiceSchema.optional(),
  tts: TtsServiceSchema.optional(),
  stt: SttServiceSchema.optional(),
  overseerr: OverseerrServiceSchema.optional(),
  infrastructure: InfrastructureServiceSchema
})

const OAuthClientSchema = z.object({
  authUrl: z.string().url(),
  tokenUrl: z.string().url(),
  userInfoUrl: z.string().url(),
  redirectUri: z.string().url(),
  scope: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().optional()
})

export const OAuthSettingsSchema = z.object({
  default: OAuthClientSchema,
  google: OAuthClientSchema,
  github: OAuthClientSchema
})

export const BackupSettingsSchema = z.object({
  debounceSeconds: z.number().int().positive(),
  directory: z.string().min(1),
  retentionDays: z.number().int().positive(),
  retentionCount: z.number().int().positive()
})

export const LimitsSettingsSchema = z.object({
  currentRequestMaxTokens: z.coerce.number().int().positive(),
  responseMaxTokens: z.coerce.number().int().positive(),
  allowUserCreation: z.boolean().default(true)
})

export type Provider = {
  id: string;
  name: string;
  type: "openai" | "ollama";
  baseUrl: string;
  apiKey?: string | undefined;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string | undefined;
  testStatus?: "untested" | "working" | "failed" | undefined;
  testError?: string | undefined;
};

export type ModelCategorySettings = {
  primary: string;
  providerId: string;
  options?: {
    temperature?: number | undefined;
    topP?: number | undefined;
    maxTokens?: number | undefined;
  } | undefined;
  dimension?: number | undefined;
};

export type ModelsSettings = {
  providers: Provider[];
  response: ModelCategorySettings;
  router: ModelCategorySettings;
  memory: ModelCategorySettings;
  utility: ModelCategorySettings;
  aggregation?: ModelCategorySettings | undefined;
  embedding?: ModelCategorySettings | undefined;
};

export type MemoryServiceSettings = {
  embeddingModel?: string | undefined;
  embeddingBaseUrl?: string | undefined;
  embeddingApiKey?: string | undefined;
  indexName?: string | undefined;
  keyPrefix?: string | undefined;
  namespace?: string | undefined;
};

export type SearchServiceSettings = {
  apiKey?: string | undefined;
  apiUrl?: string | undefined;
};

export type WeatherServiceSettings =
  | { provider: "open-meteo"; forecastUrl?: string | undefined; historicalUrl?: string | undefined; timeoutMs?: number | undefined }
  | { provider: "openweathermap"; apiKey: string; apiUrl: string; timeoutMs?: number | undefined }
  | { provider: "weatherapi"; apiKey: string; apiUrl: string; timeoutMs?: number | undefined };

export type GeocodingServiceSettings = {
  url?: string | undefined;
  userAgent?: string | undefined;
  email?: string | undefined;
  referer?: string | undefined;
};

export type HomeAssistantServiceSettings = {
  baseUrl: string;
  accessToken?: string | undefined;
};

export type InfrastructureServiceSettings = {
  redisUrl?: string | undefined;
  queuePrefix?: string | undefined;
  taskQueueName?: string | undefined;
  taskWorkerConcurrency?: number | undefined;
  taskMaxRuntimeMs?: number | undefined;
  taskAttempts?: number | undefined;
  taskBackoffMs?: number | undefined;
  taskKeepCompleted?: number | undefined;
  taskKeepFailed?: number | undefined;
  taskArchiveAfterDays?: number | undefined;
};

export type PlexServiceSettings = {
  baseUrl: string;
  token: string;
};

export type KokoroServiceSettings = {
  baseUrl?: string | undefined;
};

export type TtsServiceSettings = {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
};

export type SttServiceSettings = {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
};

export type OverseerrServiceSettings = {
  baseUrl: string;
  apiKey: string;
};

export type ServicesSettings = {
  memory: MemoryServiceSettings;
  search: SearchServiceSettings;
  weather: WeatherServiceSettings;
  geocoding: GeocodingServiceSettings;
  homeAssistant?: HomeAssistantServiceSettings | undefined;
  plex?: PlexServiceSettings | undefined;
  kokoro?: KokoroServiceSettings | undefined;
  tts?: TtsServiceSettings | undefined;
  stt?: SttServiceSettings | undefined;
  overseerr?: OverseerrServiceSettings | undefined;
  infrastructure: InfrastructureServiceSettings;
};

export type OAuthClientSettings = {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
  scope: string;
  clientId: string;
  clientSecret?: string | undefined;
};

export type OAuthSettings = {
  default: OAuthClientSettings;
  google: OAuthClientSettings;
  github: OAuthClientSettings;
};

export type BackupSettings = {
  debounceSeconds: number;
  directory: string;
  retentionDays: number;
  retentionCount: number;
};

export type LimitsSettings = {
  currentRequestMaxTokens: number;
  responseMaxTokens: number;
  allowUserCreation: boolean;
};

export type AutomationSettings = {
  enabled: boolean;
  lastRunTime?: number | undefined;
  lastRunDuration?: number | undefined;
  runCount: number;
};

export type AutomationsSettings = Record<string, AutomationSettings>;

export type BernardSettings = {
  models: ModelsSettings;
  services: ServicesSettings;
  oauth: OAuthSettings;
  backups: BackupSettings;
  limits: LimitsSettings;
  automations: AutomationsSettings;
};

export type Section = keyof BernardSettings;

export const SETTINGS_NAMESPACE = "bernard:settings";

export interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<string>
}

export class SettingsManagerCore {
  private envLoaded = false
  private envData: Record<string, string> = {}
  protected redis: RedisClient

  constructor(redis: RedisClient, envData: Record<string, string> = {}) {
    this.redis = redis
    this.envData = envData
  }

  loadEnv(envPath: string, additionalEnv?: Record<string, string>) {
    if (this.envLoaded) return

    if (additionalEnv) {
      this.envData = { ...this.envData, ...additionalEnv }
    } else if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8")
      content.split("\n").forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
        if (match && match[1]) {
          const key = match[1]
          let value = match[2] || ""
          if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1)
          }
          this.envData[key] = value
          if (!process.env[key]) {
            process.env[key] = value
          }
        }
      })
    }
    this.envLoaded = true
  }

  protected async getFromRedis(section: Section): Promise<string | null> {
    return this.redis.get(`${SETTINGS_NAMESPACE}:${section}`)
  }

  protected getFromEnv(key: string): string | undefined {
    return this.envData[key] || process.env[key]
  }

  async getSection<T>(
    section: Section,
    schema: z.ZodSchema<T>,
    defaultFactory: () => T
  ): Promise<T> {
    const redisValue = await this.getFromRedis(section)
    if (redisValue) {
      try {
        return schema.parse(JSON.parse(redisValue))
      } catch (e) {
        const error = e as Error
        console.error(
          `Failed to parse settings for ${section} from Redis: ${error?.message ?? "unknown error"}`
        )
      }
    }
    return defaultFactory()
  }

  normalizeList(raw?: string | string[] | null): string[] {
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item).trim()).filter(Boolean)
    }
    if (!raw) return []
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean)
      }
    } catch {}
    return trimmed
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
  }

  async getModels(): Promise<ModelsSettings> {
    return this.getSection("models", ModelsSettingsSchema, () => this.getDefaultModels())
  }

  async getServices(): Promise<ServicesSettings> {
    return this.getSection("services", ServicesSettingsSchema, () => this.getDefaultServices())
  }

  async getOAuth(): Promise<OAuthSettings> {
    return this.getSection("oauth", OAuthSettingsSchema, () => this.getDefaultOauth())
  }

  async getBackups(): Promise<BackupSettings> {
    return this.getSection("backups", BackupSettingsSchema, () => this.getDefaultBackups())
  }

  async getLimits(): Promise<LimitsSettings> {
    return this.getSection("limits", LimitsSettingsSchema, () => this.getDefaultLimits())
  }

  async getAutomations(): Promise<AutomationsSettings> {
    return this.getSection("automations", AutomationsSettingsSchema, () => ({}))
  }

  async getAutomationSettings(name: string): Promise<AutomationSettings> {
    const all = await this.getAutomations()
    const settings = all[name]
    if (settings) return settings
    return { enabled: true, runCount: 0 }
  }

  async setSection<T>(section: Section, data: T): Promise<void> {
    await this.redis.set(`${SETTINGS_NAMESPACE}:${section}`, JSON.stringify(data))
  }

  async setBackups(data: BackupSettings): Promise<void> {
    await this.setSection("backups", data)
  }

  async setLimits(data: LimitsSettings): Promise<void> {
    await this.setSection("limits", data)
  }

  async setOAuth(data: OAuthSettings): Promise<void> {
    await this.setSection("oauth", data)
  }

  async setModels(data: ModelsSettings): Promise<ModelsSettings> {
    await this.setSection("models", data)
    return data
  }

  async setServices(data: ServicesSettings): Promise<ServicesSettings> {
    await this.setSection("services", data)
    return data
  }

  async setAutomationSettings(name: string, settings: AutomationSettings): Promise<void> {
    const all = await this.getAutomations()
    all[name] = settings
    await this.setSection("automations", all)
  }

  async getAll(): Promise<BernardSettings> {
    return {
      models: await this.getModels(),
      services: await this.getServices(),
      oauth: await this.getOAuth(),
      backups: await this.getBackups(),
      limits: await this.getLimits(),
      automations: await this.getAutomations()
    }
  }

  async addProvider(provider: Omit<Provider, "id" | "createdAt" | "updatedAt">): Promise<Provider> {
    const id = randomBytes(8).toString("hex")
    const now = new Date().toISOString()
    const newProvider: Provider = {
      ...provider,
      id,
      createdAt: now,
      updatedAt: now
    }
    const models = await this.getModels()
    models.providers.push(newProvider)
    await this.setSection("models", models)
    return newProvider
  }

  async updateProvider(id: string, updates: Partial<Provider>): Promise<Provider | null> {
    const models = await this.getModels()
    const index = models.providers.findIndex((p: Provider) => p.id === id)
    if (index === -1) return null

    const current = models.providers[index]
    if (!current) return null

    models.providers[index] = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await this.setSection("models", models)
    return models.providers[index]!
  }

  async deleteProvider(id: string): Promise<boolean> {
    const models = await this.getModels()
    const initialCount = models.providers.length
    models.providers = models.providers.filter((p: Provider) => p.id !== id)
    if (models.providers.length === initialCount) return false
    await this.setSection("models", models)
    return true
  }

  async testProviderConnection(_provider: Provider): Promise<{ status: "working" | "failed"; error?: string; modelCount?: number }> {
    return { status: "working", modelCount: 0 }
  }

  getDefaultModels(): ModelsSettings {
    const DEFAULT_MODEL = "gpt-3.5-turbo"

    const ollamaBaseUrl = this.getFromEnv("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1"
    const ollamaApiKey = this.getFromEnv("OLLAMA_API_KEY")
    const ollamaProviderBase: Omit<Provider, "apiKey"> = {
      id: "ollama-provider",
      name: "Ollama",
      type: "openai",
      baseUrl: ollamaBaseUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      testStatus: "untested"
    }
    const ollamaProvider: Provider = ollamaApiKey
      ? { ...ollamaProviderBase, apiKey: ollamaApiKey }
      : ollamaProviderBase

    const openrouterBaseUrl = this.getFromEnv("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1"
    const openrouterApiKey = this.getFromEnv("OPENROUTER_API_KEY")
    const defaultProviderBase: Omit<Provider, "apiKey"> = {
      id: "default-provider",
      name: "Default Provider",
      type: "openai",
      baseUrl: openrouterBaseUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      testStatus: "untested"
    }
    const defaultProvider: Provider = openrouterApiKey
      ? { ...defaultProviderBase, apiKey: openrouterApiKey }
      : defaultProviderBase

    const responseModel = this.getFromEnv("RESPONSE_MODELS")?.split(",")[0]?.trim() ?? DEFAULT_MODEL

    const settings: ModelsSettings = {
      providers: [ollamaProvider, defaultProvider],
      response: { primary: responseModel, providerId: defaultProvider.id, options: { temperature: 0.5 } },
      router: { primary: this.getFromEnv("ROUTER_MODELS")?.split(",")[0]?.trim() ?? responseModel, providerId: defaultProvider.id, options: { temperature: 0 } },
      memory: { primary: this.getFromEnv("MEMORY_MODELS")?.split(",")[0]?.trim() ?? responseModel, providerId: defaultProvider.id, options: { temperature: 0 } },
      utility: { primary: this.getFromEnv("UTILITY_MODELS")?.split(",")[0]?.trim() ?? responseModel, providerId: defaultProvider.id, options: { temperature: 0 } }
    }

    const aggregationModel = this.getFromEnv("AGGREGATION_MODELS")?.split(",")[0]?.trim()
    if (aggregationModel) {
      settings.aggregation = { primary: aggregationModel, providerId: defaultProvider.id, options: { temperature: 0 } }
    }

    const embeddingModel = this.getFromEnv("EMBEDDING_MODELS")?.split(",")[0]?.trim() ?? "nomic-embed-text"
    settings.embedding = { primary: embeddingModel, providerId: ollamaProvider.id }

    return settings
  }

  getDefaultServices(): ServicesSettings {
    const redisUrl = this.getFromEnv("REDIS_URL")
    const infrastructure: InfrastructureServiceSettings = {}
    if (redisUrl) infrastructure.redisUrl = redisUrl

    const embeddingModel = this.getFromEnv("EMBEDDING_MODEL")
    const embeddingBaseUrl = this.getFromEnv("EMBEDDING_BASE_URL")
    const embeddingApiKey = this.getFromEnv("EMBEDDING_API_KEY")
    const indexName = this.getFromEnv("MEMORY_INDEX_NAME")
    const keyPrefix = this.getFromEnv("MEMORY_KEY_PREFIX")
    const namespace = this.getFromEnv("MEMORY_NAMESPACE")
    const memory: MemoryServiceSettings = {
      ...(embeddingModel && { embeddingModel }),
      ...(embeddingBaseUrl && { embeddingBaseUrl }),
      ...(embeddingApiKey && { embeddingApiKey }),
      ...(indexName && { indexName }),
      ...(keyPrefix && { keyPrefix }),
      ...(namespace && { namespace })
    } as MemoryServiceSettings

    const searchApiKey = this.getFromEnv("SEARCH_API_KEY") ?? this.getFromEnv("BRAVE_API_KEY")
    const searchApiUrl = this.getFromEnv("SEARCH_API_URL")
    const search: SearchServiceSettings = {
      ...(searchApiKey && { apiKey: searchApiKey }),
      ...(searchApiUrl && { apiUrl: searchApiUrl })
    } as SearchServiceSettings

    const weather: WeatherServiceSettings = {
      provider: "open-meteo",
      forecastUrl: "https://api.open-meteo.com/v1/forecast",
      historicalUrl: "https://archive-api.open-meteo.com/v1/archive"
    }

    const geocodingUrl = this.getFromEnv("NOMINATIM_URL")
    const geocodingUserAgent = this.getFromEnv("NOMINATIM_USER_AGENT")
    const geocodingEmail = this.getFromEnv("NOMINATIM_EMAIL")
    const geocodingReferer = this.getFromEnv("NOMINATIM_REFERER")
    const geocoding: GeocodingServiceSettings = {
      ...(geocodingUrl && { url: geocodingUrl }),
      ...(geocodingUserAgent && { userAgent: geocodingUserAgent }),
      ...(geocodingEmail && { email: geocodingEmail }),
      ...(geocodingReferer && { referer: geocodingReferer })
    } as GeocodingServiceSettings

    const settings: ServicesSettings = {
      infrastructure,
      memory,
      search,
      weather,
      geocoding
    }

    const haBaseUrl = this.getFromEnv("HA_BASE_URL")
    if (haBaseUrl) {
      const haAccessToken = this.getFromEnv("HA_ACCESS_TOKEN")
      const homeAssistant: HomeAssistantServiceSettings = {
        baseUrl: haBaseUrl,
        ...(haAccessToken && { accessToken: haAccessToken })
      }
      settings.homeAssistant = homeAssistant
    }

    const plexUrl = this.getFromEnv("PLEX_URL")
    const plexToken = this.getFromEnv("PLEX_TOKEN")
    if (plexUrl && plexToken) {
      settings.plex = { baseUrl: plexUrl, token: plexToken }
    }

    settings.kokoro = {
      baseUrl: this.getFromEnv("KOKORO_URL") || "http://localhost:8880"
    }

    const ttsUrl = this.getFromEnv("TTS_URL")
    const ttsApiKey = this.getFromEnv("TTS_API_KEY")
    if (ttsUrl || ttsApiKey) {
      settings.tts = {
        ...(ttsUrl && { baseUrl: ttsUrl }),
        ...(ttsApiKey && { apiKey: ttsApiKey })
      }
    }

    const sttUrl = this.getFromEnv("STT_URL")
    const sttApiKey = this.getFromEnv("STT_API_KEY")
    if (sttUrl || sttApiKey) {
      settings.stt = {
        ...(sttUrl && { baseUrl: sttUrl }),
        ...(sttApiKey && { apiKey: sttApiKey })
      }
    }

    const overseerrUrl = this.getFromEnv("OVERSEERR_URL")
    const overseerrApiKey = this.getFromEnv("OVERSEERR_API_KEY")
    if (overseerrUrl && overseerrApiKey) {
      settings.overseerr = {
        baseUrl: overseerrUrl,
        apiKey: overseerrApiKey
      }
    }

    return settings
  }

  getDefaultOauth(): OAuthSettings {
    const clientSecret = this.getFromEnv("OAUTH_CLIENT_SECRET")
    const googleSecret = this.getFromEnv("OAUTH_GOOGLE_CLIENT_SECRET")
    const githubSecret = this.getFromEnv("OAUTH_GITHUB_CLIENT_SECRET")

    const base: OAuthClientSettings = {
      authUrl: this.getFromEnv("OAUTH_AUTH_URL") ?? "",
      tokenUrl: this.getFromEnv("OAUTH_TOKEN_URL") ?? "",
      userInfoUrl: this.getFromEnv("OAUTH_USERINFO_URL") ?? "",
      redirectUri: this.getFromEnv("OAUTH_REDIRECT_URI") ?? "",
      scope: this.getFromEnv("OAUTH_SCOPES") ?? "openid profile",
      clientId: this.getFromEnv("OAUTH_CLIENT_ID") ?? ""
    }
    if (clientSecret) base.clientSecret = clientSecret

    const google: OAuthClientSettings = {
      authUrl: this.getFromEnv("OAUTH_GOOGLE_AUTH_URL") ?? base.authUrl,
      tokenUrl: this.getFromEnv("OAUTH_GOOGLE_TOKEN_URL") ?? base.tokenUrl,
      userInfoUrl: this.getFromEnv("OAUTH_GOOGLE_USERINFO_URL") ?? base.userInfoUrl,
      clientId: this.getFromEnv("OAUTH_GOOGLE_CLIENT_ID") ?? "",
      redirectUri: this.getFromEnv("OAUTH_GOOGLE_REDIRECT_URI") ?? base.redirectUri,
      scope: base.scope
    }
    if (googleSecret) google.clientSecret = googleSecret

    const github: OAuthClientSettings = {
      authUrl: this.getFromEnv("OAUTH_GITHUB_AUTH_URL") ?? "https://github.com/login/oauth/authorize",
      tokenUrl: this.getFromEnv("OAUTH_GITHUB_TOKEN_URL") ?? "https://github.com/login/oauth/access_token",
      userInfoUrl: this.getFromEnv("OAUTH_GITHUB_USERINFO_URL") ?? "https://api.github.com/user",
      clientId: this.getFromEnv("OAUTH_GITHUB_CLIENT_ID") ?? "",
      redirectUri: this.getFromEnv("OAUTH_GITHUB_REDIRECT_URI") ?? base.redirectUri,
      scope: base.scope
    }
    if (githubSecret) github.clientSecret = githubSecret

    return { default: base, google, github }
  }

  getDefaultBackups(): BackupSettings {
    const settings: BackupSettings = {
      debounceSeconds: Number(this.getFromEnv("BACKUP_DEBOUNCE_SECONDS")) || 60,
      directory: this.getFromEnv("BACKUP_DIR") ?? path.join(process.cwd(), "backups"),
      retentionDays: Number(this.getFromEnv("BACKUP_RETENTION_DAYS")) || 14,
      retentionCount: Number(this.getFromEnv("BACKUP_RETENTION_COUNT")) || 20
    }
    return settings
  }

  getDefaultLimits(): LimitsSettings {
    return {
      currentRequestMaxTokens: Number(this.getFromEnv("CURRENT_REQUEST_MAX_TOKENS")) || 8000,
      responseMaxTokens: Number(this.getFromEnv("RESPONSE_MAX_TOKENS")) || 8000,
      allowUserCreation: this.getFromEnv("ALLOW_USER_CREATION") !== "false"
    } as LimitsSettings
  }
}

let singletonInstance: SettingsManagerCore | null = null

export function getSettingsManager(): SettingsManagerCore {
  if (!singletonInstance) {
    throw new Error('SettingsManager not initialized. Use SettingsManagerCore directly in tests or call initializeSettingsManager() in production.')
  }
  return singletonInstance
}

export async function initializeSettingsManager(redis?: RedisClient): Promise<SettingsManagerCore> {
  if (singletonInstance) {
    return singletonInstance
  }

  const redisClient = redis || {
    get: async () => null,
    set: async () => 'OK',
  }

  singletonInstance = new SettingsManagerCore(redisClient)
  const envPath = path.resolve(__dirname, '..', '..', '..', '.env')
  singletonInstance.loadEnv(envPath)

  return singletonInstance
}

export function resetSettingsManager() {
  singletonInstance = null
}

// Static factory method for backward compatibility with SettingsManager.getInstance()
export namespace SettingsManagerCore {
  export function getInstance(): SettingsManagerCore {
    if (!singletonInstance) {
      throw new Error('SettingsManager not initialized. Call initializeSettingsManager() first.')
    }
    return singletonInstance
  }
}

export const appSettings: SettingsManagerCore = new Proxy({} as SettingsManagerCore, {
  get(_target, prop) {
    if (prop === 'then') {
      return undefined
    }
    if (singletonInstance) {
      return Reflect.get(singletonInstance, prop)
    }
    throw new Error('appSettings requires initialization. Call initializeSettingsManager() before use.')
  },
  set(_target, prop, value) {
    if (singletonInstance) {
      return Reflect.set(singletonInstance, prop, value)
    }
    throw new Error('appSettings requires initialization. Call initializeSettingsManager() before use.')
  },
})

// Backward compatibility alias - SettingsManager was the old class name
export const SettingsManager = SettingsManagerCore
