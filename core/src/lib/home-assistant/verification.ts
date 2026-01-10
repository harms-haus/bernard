import { getSettings } from '../config/settingsCache'

/**
 * Verify Home Assistant configuration is valid
 */
export async function verifyHomeAssistantConfigured(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const settings = await getSettings();
    const ha = settings?.services?.homeAssistant;

    if (!ha) {
      return { ok: false, reason: "Home Assistant is not configured" };
    }

    if (!ha.baseUrl) {
      return { ok: false, reason: "Home Assistant base URL is not configured" };
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Failed to verify Home Assistant configuration: ${errorMessage}` };
  }
}
