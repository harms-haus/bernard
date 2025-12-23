import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import type { Automation, AutomationRegistryEntry, AutomationSettings } from "./types";
import { SettingsStore, type AutomationsSettings } from "../config/settingsStore";
import { childLogger, logger } from "../logging";

const log = childLogger({ component: "automation_registry" }, logger);

/**
 * Load all automation modules statically
 */
async function loadAutomations(): Promise<Map<string, Automation>> {
  const automationCache = new Map();

  try {
    // Import automations statically
    const { automation: summarizeAutomation } = await import('./automations/summarizeConversation');
    const { automation: tagAutomation } = await import('./automations/tagConversation');
    const { automation: flagAutomation } = await import('./automations/flagConversation');
    const { automation: indexAutomation } = await import('./automations/indexConversation');

    // Add them to the cache
    [summarizeAutomation, tagAutomation, flagAutomation, indexAutomation].forEach(automation => {
      if (automation && automation.id && automation.name) {
        automationCache.set(automation.id, automation);
      }
    });

  } catch (err) {
    console.error("Failed to load automations:", err);
  }

  return automationCache;
}

/**
 * Get automation settings from the settings store
 */
async function getAutomationSettings(automationId: string): Promise<AutomationSettings> {
  try {
    const store = new SettingsStore();
    return await store.getAutomationSettings(automationId);
  } catch (err) {
    // log.warn("Failed to load automation settings, using defaults", { automationId, error: String(err) });
    return {
      enabled: true,
      runCount: 0
    };
  }
}

/**
 * Save automation settings to the settings store
 */
async function saveAutomationSettings(automationId: string, settings: AutomationSettings): Promise<void> {
  try {
    const store = new SettingsStore();
    await store.setAutomationSettings(automationId, settings);
    // log.debug("Saved automation settings", { automationId, settings });
  } catch (err) {
    // log.error("Failed to save automation settings", { automationId, error: String(err) });
  }
}

/**
 * Get the complete automation registry with settings
 */
export async function getAutomationRegistry(): Promise<Map<string, AutomationRegistryEntry>> {
  const automations = await loadAutomations();
  const registry = new Map<string, AutomationRegistryEntry>();

  for (const [id, automation] of automations) {
    const settings = await getAutomationSettings(id);
    registry.set(id, { automation, settings });
  }

  return registry;
}

/**
 * Get a specific automation by ID
 */
export async function getAutomation(automationId: string): Promise<AutomationRegistryEntry | null> {
  const registry = await getAutomationRegistry();
  return registry.get(automationId) || null;
}

/**
 * Update automation settings
 */
export async function updateAutomationSettings(automationId: string, updates: Partial<AutomationSettings>): Promise<AutomationSettings> {
  const entry = await getAutomation(automationId);
  if (!entry) {
    throw new Error(`Automation not found: ${automationId}`);
  }

  const newSettings = { ...entry.settings, ...updates };
  await saveAutomationSettings(automationId, newSettings);

  // Update the entry
  entry.settings = newSettings;

  return newSettings;
}

/**
 * Clear the automation cache (useful for testing or hot reloading)
 * Note: Automations are loaded fresh each time, no persistent cache exists
 */
export function clearAutomationCache(): void {
  // No-op: automations are loaded fresh each time
}
