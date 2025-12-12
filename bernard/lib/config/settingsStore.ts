import fs from "node:fs";
import path from "node:path";

import type Redis from "ioredis";
import { z } from "zod";

import { getRedis } from "../infra/redis";

const DEFAULT_MODEL = "kwaipilot/KAT-coder-v1:free";
const SETTINGS_NAMESPACE = "bernard:settings";

export const ModelCategorySchema = z.object({
  primary: z.string().min(1),
  fallbacks: z.array(z.string().min(1)).default([]),
  options: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxTokens: z.number().int().positive().optional(),
      baseUrl: z.string().url().optional(),
      apiKey: z.string().optional()
    })
    .optional()
});

export const ModelsSettingsSchema = z.object({
  response: ModelCategorySchema,
  intent: ModelCategorySchema,
  memory: ModelCategorySchema,
  utility: ModelCategorySchema,
  aggregation: ModelCategorySchema.optional()
});

const MemoryServiceSchema = z.object({
  embeddingModel: z.string().optional(),
  embeddingBaseUrl: z.string().url().optional(),
  embeddingApiKey: z.string().optional(),
  indexName: z.string().optional(),
  keyPrefix: z.string().optional(),
  namespace: z.string().optional()
});

const SearchServiceSchema = z.object({
  apiKey: z.string().optional(),
  apiUrl: z.string().url().optional()
});

const WeatherServiceSchema = z.object({
  apiKey: z.string().optional(),
  apiUrl: z.string().url().optional(),
  forecastUrl: z.string().url().optional(),
  historicalUrl: z.string().url().optional(),
  units: z.enum(["metric", "imperial"]).optional(),
  timeoutMs: z.number().int().positive().optional()
});

const GeocodingServiceSchema = z.object({
  url: z.string().url().optional(),
  userAgent: z.string().optional(),
  email: z.string().email().optional(),
  referer: z.string().optional()
});

export const ServicesSettingsSchema = z.object({
  memory: MemoryServiceSchema.default({}),
  search: SearchServiceSchema.default({}),
  weather: WeatherServiceSchema.default({}),
  geocoding: GeocodingServiceSchema.default({})
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

export type ModelCategorySettings = z.infer<typeof ModelCategorySchema>;
export type ModelsSettings = z.infer<typeof ModelsSettingsSchema>;
export type ServicesSettings = z.infer<typeof ServicesSettingsSchema>;
export type OAuthSettings = z.infer<typeof OAuthSettingsSchema>;
export type BackupSettings = z.infer<typeof BackupSettingsSchema>;

export type BernardSettings = {
  models: ModelsSettings;
  services: ServicesSettings;
  oauth: OAuthSettings;
  backups: BackupSettings;
};

export type Section = keyof BernardSettings;
type PersistedSettings = Partial<Record<Section, unknown>>;

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
 * Builds a model category from env vars (preferred) with optional fallback lists.
 */
export function defaultModelCategory(envKey: string, fallback?: string[]): ModelCategorySettings {
  const configured = normalizeList(process.env[envKey]);
  const legacy = normalizeList(process.env["OPENROUTER_MODEL"]);
  const primary = configured[0] ?? fallback?.[0] ?? legacy[0] ?? DEFAULT_MODEL;
  const fallbacks = configured.slice(1) ?? fallback ?? legacy.slice(1) ?? [];
  return { primary, fallbacks };
}

/**
 * Default model selections for each category, cascading from response models.
 */
export function defaultModels(): ModelsSettings {
  const response = defaultModelCategory("RESPONSE_MODELS");
  const intent = defaultModelCategory("INTENT_MODELS", [response.primary]);
  const memory = defaultModelCategory("MEMORY_MODELS", [response.primary]);
  const utility = defaultModelCategory("UTILITY_MODELS", [response.primary]);
  const aggregation = defaultModelCategory("AGGREGATION_MODELS", [response.primary]);
  return { response, intent, memory, utility, aggregation };
}

/**
 * Default third-party service configuration sourced from environment variables.
 */
export function defaultServices(): ServicesSettings {
  return {
    memory: {
      embeddingModel: process.env["EMBEDDING_MODEL"],
      embeddingBaseUrl: process.env["EMBEDDING_BASE_URL"],
      embeddingApiKey: process.env["EMBEDDING_API_KEY"],
      indexName: process.env["MEMORY_INDEX_NAME"],
      keyPrefix: process.env["MEMORY_KEY_PREFIX"],
      namespace: process.env["MEMORY_NAMESPACE"]
    },
    search: {
      apiKey: process.env["SEARCH_API_KEY"],
      apiUrl: process.env["SEARCH_API_URL"]
    },
    weather: {
      apiKey: process.env["WEATHER_API_KEY"],
      apiUrl: process.env["WEATHER_API_URL"],
      forecastUrl: process.env["OPEN_METEO_FORECAST_URL"],
      historicalUrl: process.env["OPEN_METEO_HISTORICAL_URL"]
    },
    geocoding: {
      url: process.env["NOMINATIM_URL"],
      userAgent: process.env["NOMINATIM_USER_AGENT"],
      email: process.env["NOMINATIM_EMAIL"],
      referer: process.env["NOMINATIM_REFERER"]
    }
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

  async getAll(): Promise<BernardSettings> {
    const [models, services, oauth, backups] = await Promise.all([
      this.getModels(),
      this.getServices(),
      this.getOAuth(),
      this.getBackups()
    ]);
    return { models, services, oauth, backups };
  }
}

