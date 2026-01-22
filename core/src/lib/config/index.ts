export { clearSettingsCache, getSettings } from '@/lib/config/settingsCache';

export {
  SettingsStore,
  defaultModels,
  defaultServices,
  defaultBackups,
  defaultOauth,
  ensureDirectory,
  parseJson,
  normalizeList as normalizeSettingsList
} from '@/lib/config/settingsStore';

export {
  DEFAULT_MODEL_ID,
  setSettingsFetcher as setModelSettingsFetcher,
  resetSettingsFetcher,
  resolveModel,
  resolveUtilityModel,
  resolveApiKey,
  resolveBaseUrl,
  splitModelAndProvider,
  normalizeList as normalizeModelList
} from '@/lib/config/models';

export {
  AGENT_MODEL_REGISTRY,
  getAgentDefinition,
  getAgentRoleDefinition,
  listAgentDefinitions,
  isRegisteredAgent,
  getRequiredRoleIds,
  type AgentModelDefinition,
  type ModelRoleDefinition
} from '@/lib/config/agentModelRegistry';
