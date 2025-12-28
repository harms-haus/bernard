import { appSettings } from "@shared/config/appSettings";
import path from "node:path";

// Initialize appSettings with local .env path
appSettings.loadEnv(path.join(process.cwd(), ".env"));

export { 
  appSettings,
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

// Keep original exported class if it was used
export class SettingsStore {
  async getModels() { return appSettings.getModels(); }
  async getServices() { return appSettings.getServices(); }
  async getOAuth() { return appSettings.getOAuth(); }
  async getBackups() { return appSettings.getBackups(); }
  async getLimits() { return appSettings.getLimits(); }
  async getAutomations() { return appSettings.getAutomations(); }
  async getAll() { return appSettings.getAll(); }
}
