import { getStates } from "home-assistant-js-websocket";
import { getHAConnection } from "./utility/home-assistant-websocket-client";
import type { HARestConfig } from "./home-assistant-list-entities.tool";

/**
 * Home Assistant entity state object
 */
export interface HAEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
  context?: unknown;
}

/**
 * Cache for entity states to avoid multiple fetches
 */
class EntityStateCache {
  private cache = new Map<string, { state: HAEntityState; timestamp: number }>();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  get(key: string): HAEntityState | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.state;
  }

  set(key: string, state: HAEntityState): void {
    this.cache.set(key, { state, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const entityStateCache = new EntityStateCache();

/**
 * Fetch a single entity's state with attributes from Home Assistant
 */
export async function getEntityState(
  baseUrl: string,
  accessToken: string,
  entityId: string
): Promise<HAEntityState | null> {
  const cacheKey = `${baseUrl}:${entityId}`;

  // Check cache first
  const cached = entityStateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const connection = await getHAConnection(baseUrl, accessToken);

    // Use WebSocket API to get all states and filter to our entity
    const states = await getStates(connection);

    const entityState = states.find(state => state.entity_id === entityId);
    if (!entityState) {
      return null;
    }

    // Convert to our interface format
    const result: HAEntityState = {
      entity_id: entityState.entity_id,
      state: entityState.state,
      attributes: entityState.attributes,
      last_changed: entityState.last_changed,
      last_updated: entityState.last_updated,
      context: entityState.context
    };

    // Cache the result
    entityStateCache.set(cacheKey, result);

    return result;

  } catch (error) {
    console.error('[HA Entity State] Failed to fetch entity state:', error);
    throw error;
  }
}

/**
 * Get entity state using REST API as fallback (not preferred but available)
 */
export async function getEntityStateREST(
  baseUrl: string,
  accessToken: string,
  entityId: string
): Promise<HAEntityState | null> {
  const cacheKey = `${baseUrl}:${entityId}`;

  // Check cache first
  const cached = entityStateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `${baseUrl}/api/states/${entityId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Entity not found
      }
      throw new Error(`HA API error: ${response.status} ${response.statusText}`);
    }

    const entityState = await response.json();

    const result: HAEntityState = {
      entity_id: entityState.entity_id,
      state: entityState.state,
      attributes: entityState.attributes,
      last_changed: entityState.last_changed,
      last_updated: entityState.last_updated,
      context: entityState.context
    };

    // Cache the result
    entityStateCache.set(cacheKey, result);

    return result;

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout while fetching entity state');
    }
    console.error('[HA Entity State REST] Failed to fetch entity state:', error);
    throw error;
  }
}

/**
 * Get multiple entity states efficiently
 */
export async function getMultipleEntityStates(
  baseUrl: string,
  accessToken: string,
  entityIds: string[]
): Promise<Map<string, HAEntityState>> {
  try {
    const connection = await getHAConnection(baseUrl, accessToken);
    const states = await getStates(connection);

    const result = new Map<string, HAEntityState>();

    for (const entityId of entityIds) {
      const state = states.find(s => s.entity_id === entityId);
      if (state) {
        const entityState: HAEntityState = {
          entity_id: state.entity_id,
          state: state.state,
          attributes: state.attributes,
          last_changed: state.last_changed,
          last_updated: state.last_updated,
          context: state.context
        };

        const cacheKey = `${baseUrl}:${entityId}`;
        entityStateCache.set(cacheKey, entityState);
        result.set(entityId, entityState);
      }
    }

    return result;

  } catch (error) {
    console.error('[HA Entity State] Failed to fetch multiple entity states:', error);
    throw error;
  }
}

/**
 * Check if an entity supports color modes for lights
 */
export function getSupportedColorModes(entityState: HAEntityState): string[] {
  if (entityState.attributes?.['supported_color_modes']) {
    const modes = entityState.attributes['supported_color_modes'];
    return Array.isArray(modes)
      ? modes as string[]
      : [modes as string];
  }

  // Fallback for older HA versions or entities without explicit color mode support
  if (entityState.attributes?.['rgb_color'] !== undefined) {
    return ['rgb'];
  }
  if (entityState.attributes?.['xy_color'] !== undefined) {
    return ['xy'];
  }
  if (entityState.attributes?.['hs_color'] !== undefined) {
    return ['hs'];
  }
  if (entityState.attributes?.['color_temp_kelvin'] !== undefined || entityState.attributes?.['color_temp'] !== undefined) {
    return ['color_temp_kelvin'];
  }

  return [];
}

/**
 * Get current brightness of a light entity (0-255 scale)
 */
export function getCurrentBrightness(entityState: HAEntityState): number | null {
  const brightness = entityState.attributes?.['brightness'];
  if (typeof brightness === 'number') {
    return brightness;
  }
  return null;
}

/**
 * Get current color temperature in Kelvin
 */
export function getCurrentColorTemp(entityState: HAEntityState): number | null {
  const colorTempKelvin = entityState.attributes?.['color_temp_kelvin'];
  if (typeof colorTempKelvin === 'number') {
    return colorTempKelvin;
  }
  // Convert from mireds if available
  const colorTemp = entityState.attributes?.['color_temp'];
  if (typeof colorTemp === 'number') {
    return Math.round(1000000 / colorTemp);
  }
  return null;
}

/**
 * Clear the entity state cache
 */
export function clearEntityStateCache(): void {
  entityStateCache.clear();
}
