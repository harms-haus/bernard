/**
 * Model Resolution System
 * 
 * Provides model configuration resolution for agents and utility tasks.
 * Replaces the old category-based resolution with agent-centric resolution.
 */

import { getSettings } from "./settingsCache";
import type { BernardSettings, UtilityModelSettings, AgentModelSettings, AgentModelRoleSettings } from "./appSettings";
import { getAgentDefinition, getAgentRoleDefinition, isRegisteredAgent } from "./agentModelRegistry";

export type { UtilityModelSettings, AgentModelSettings, AgentModelRoleSettings };

const DEFAULT_MODEL = "gpt-3.5-turbo";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export const DEFAULT_MODEL_ID = DEFAULT_MODEL;

type SettingsFetcher = (forceRefresh?: boolean) => Promise<BernardSettings>;
let fetchSettings: SettingsFetcher = getSettings;

/**
 * Swap out the settings fetcher (primarily for tests).
 */
export function setSettingsFetcher(fetcher: SettingsFetcher) {
  fetchSettings = fetcher;
}

/**
 * Restore the default settings fetcher.
 */
export function resetSettingsFetcher(this: void) {
  fetchSettings = getSettings;
}

export type ModelCallOptions = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
};

export type ResolvedModel = {
  type: "openai" | "ollama";
  id: string;
  options?: ModelCallOptions;
};

/**
 * Normalize a raw list from env or configuration into a trimmed string array.
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
 * Get the provider information for a given provider ID.
 */
async function getProviderInfo(
  providerId: string,
  settings: BernardSettings
): Promise<{ baseURL: string | undefined; apiKey: string | undefined; type: "openai" | "ollama" }> {
  const provider = settings.models.providers?.find(p => p.id === providerId);
  if (!provider) {
    return { baseURL: undefined, apiKey: undefined, type: "openai" };
  }
  return {
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
    type: provider.type,
  };
}

/**
 * Build resolved model options from settings.
 */
function buildModelOptions(
  providerInfo: { baseURL: string | undefined; apiKey: string | undefined; type: "openai" | "ollama" },
  roleSettings?: AgentModelRoleSettings | UtilityModelSettings
): { id: string; options: Partial<Record<string, any>> } {
  const { baseURL, apiKey, type } = providerInfo;

  if (type === "openai") {
    return {
      id: roleSettings?.primary ?? DEFAULT_MODEL,
      options: {
        modelProvider: "openai",
        configuration: {
          baseURL,
          apiKey,
        },
        temperature: roleSettings?.options?.temperature,
        maxTokens: roleSettings?.options?.maxTokens,
        timeout: 60000, // 60 second timeout for model calls
      },
    };
  } else if (type === "ollama") {
    return {
      id: roleSettings?.primary ?? DEFAULT_MODEL,
      options: {
        modelProvider: "ollama",
        baseUrl: baseURL,
        temperature: roleSettings?.options?.temperature,
        maxTokens: roleSettings?.options?.maxTokens,
        timeout: 60000, // 60 second timeout for model calls
      },
    };
  } else {
    throw new Error(`Unknown model type: ${type}`);
  }
}

/**
 * Resolve a model configuration for a specific agent and role.
 * 
 * @param agentId - The agent's graph ID (e.g., "bernard_agent")
 * @param roleId - The role ID within the agent (e.g., "main")
 * @param opts - Optional override for fallback behavior
 * @returns Resolved model ID and call options
 * 
 * @throws Error if agent is not registered
 * @throws Error if role is not defined for the agent
 */
export async function resolveModel(
  agentId: string,
  roleId: string,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<{ id: string; options: Partial<Record<string, any>> }> {
  // Validate agent is registered
  if (!isRegisteredAgent(agentId)) {
    throw new Error(`Unknown agent: ${agentId}. Agents must be registered in agentModelRegistry.ts`);
  }

  // Get role definition for validation
  const roleDefinition = getAgentRoleDefinition(agentId, roleId);
  if (!roleDefinition) {
    throw new Error(`Unknown role '${roleId}' for agent '${agentId}'. Check agentModelRegistry.ts for valid roles.`);
  }

  const settings = await fetchSettings();

  // Find the agent configuration in settings
  const agentConfig = settings.models.agents.find(a => a.agentId === agentId);
  if (!agentConfig) {
    throw new Error(`Agent '${agentId}' not configured in settings. Add agent configuration to models.agents.`);
  }

  // Find the role configuration
  const roleConfig = agentConfig.roles.find(r => r.id === roleId);
  if (!roleConfig) {
    throw new Error(`Role '${roleId}' not configured for agent '${agentId}'. Add role configuration to models.agents[].roles.`);
  }

  // Handle override
  const override = normalizeList(opts.override);
  if (override.length > 0) {
    return {
      id: override[0],
      options: {
        modelProvider: "openai",
        configuration: { baseURL: undefined, apiKey: undefined },
        temperature: 0,
        maxTokens: undefined,
        timeout: 60000,
      },
    };
  }

  // Get provider information
  const providerInfo = await getProviderInfo(roleConfig.providerId, settings);

  return buildModelOptions(providerInfo, roleConfig);
}

/**
 * Resolve the utility model for system-wide tasks.
 * 
 * @param opts - Optional override for fallback behavior
 * @returns Resolved model ID and call options
 */
export async function resolveUtilityModel(
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<{ id: string; options: Partial<Record<string, any>> }> {
  const settings = await fetchSettings();

  // Handle override
  const override = normalizeList(opts.override);
  if (override.length > 0) {
    return {
      id: override[0],
      options: {
        modelProvider: "openai",
        configuration: { baseURL: undefined, apiKey: undefined },
        temperature: 0,
        maxTokens: undefined,
        timeout: 60000,
      },
    };
  }

  const utilitySettings = settings.models.utility;

  // Get provider information
  const providerInfo = await getProviderInfo(utilitySettings.providerId, settings);

  return buildModelOptions(providerInfo, utilitySettings);
}

/**
 * Resolve the base URL, preferring call options over explicit and env defaults.
 */
export function resolveBaseUrl(baseURL?: string, options?: ModelCallOptions): string {
  return options?.baseUrl ?? baseURL ?? DEFAULT_BASE_URL;
}

/**
 * Resolve the API key, preferring call options over explicit and env defaults.
 */
export function resolveApiKey(apiKey?: string, options?: ModelCallOptions): string | undefined {
  return options?.apiKey ?? apiKey;
}

/**
 * Split a combined model/provider string into its parts.
 */
export function splitModelAndProvider(modelId: string): { model: string; providerOnly?: string[] } {
  const [rawModel, rawProvider] = modelId.split("|", 2);
  const model = (rawModel ?? modelId).trim();
  const providerOnly = rawProvider
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const base = { model: model || modelId };
  return providerOnly?.length ? { ...base, providerOnly } : base;
}
