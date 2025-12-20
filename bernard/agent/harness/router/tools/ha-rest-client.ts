import type { HomeAssistantEntity } from "./ha-entities";

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Home Assistant state object returned by /api/states
 */
interface HAStateObject {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    // Other attributes may exist but we don't need them for basic functionality
    [key: string]: unknown;
  };
  last_changed?: string;
  last_updated?: string;
}

/**
 * Fetch all Home Assistant entities from the REST API
 */
export async function fetchHAEntities(
  baseUrl: string,
  accessToken: string
): Promise<HomeAssistantEntity[]> {
  const url = `${baseUrl}/api/states`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Home Assistant authentication failed. Please check your access token.");
      } else if (response.status === 403) {
        throw new Error("Home Assistant access forbidden. Please check your access token permissions.");
      } else {
        throw new Error(`Home Assistant API error: ${response.status} ${response.statusText}`);
      }
    }

    const states = await response.json() as HAStateObject[];

    // Filter to only commonly exposed entity domains (matching HA assistant pipeline)
    const exposedDomains = new Set([
      'light', 'switch', 'sensor', 'binary_sensor', 'climate', 'media_player',
      'cover', 'lock', 'fan', 'vacuum', 'camera', 'alarm_control_panel',
      'humidifier', 'water_heater', 'remote', 'siren'
    ]);

    const filteredStates = states.filter(state => {
      const domain = state.entity_id.split('.')[0];
      return domain && exposedDomains.has(domain);
    });

    // Transform HA state objects to HomeAssistantEntity format (matching CSV structure)
    return filteredStates.map(state => ({
      entity_id: state.entity_id,
      name: state.attributes.friendly_name || state.entity_id,
      state: state.state,
      aliases: [] // HA REST API doesn't provide aliases, keep empty array
    }));

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Home Assistant API request timed out. Please check your connection.");
      }
      throw error;
    }
    throw new Error(`Failed to fetch Home Assistant entities: ${String(error)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call a Home Assistant service via REST API
 */
export async function callHAService(
  baseUrl: string,
  accessToken: string,
  domain: string,
  service: string,
  serviceData: Record<string, unknown>
): Promise<unknown> {
  const url = `${baseUrl}/api/services/${domain}/${service}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(serviceData),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Home Assistant authentication failed. Please check your access token.");
      } else if (response.status === 403) {
        throw new Error("Home Assistant access forbidden. Please check your access token permissions.");
      } else if (response.status === 404) {
        throw new Error(`Home Assistant service not found: ${domain}.${service}`);
      } else {
        throw new Error(`Home Assistant API error: ${response.status} ${response.statusText}`);
      }
    }

    // Some services return data, others don't. Try to parse JSON response.
    try {
      return await response.json();
    } catch {
      // If parsing fails, return success indication
      return { success: true };
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Home Assistant service call timed out. Please check your connection.");
      }
      throw error;
    }
    throw new Error(`Failed to call Home Assistant service: ${String(error)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
