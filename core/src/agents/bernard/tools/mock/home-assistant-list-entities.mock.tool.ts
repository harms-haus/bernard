import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolFactory } from "../types";
import { MOCK_LIGHT_ENTITIES, getMockLightEntities, findMockLightEntity } from "./home-assistant-toggle-light.mock.tool";

/**
 * Home Assistant entity type for mock data.
 */
export interface MockHomeAssistantEntity {
  entity_id: string;
  name: string;
  state: string;
  domain: string;
  last_changed: string;
  attributes: Record<string, unknown>;
}

/**
 * Create mock entities from mock light entities.
 */
function createMockEntitiesFromLights(): MockHomeAssistantEntity[] {
  return MOCK_LIGHT_ENTITIES.map(entity => ({
    entity_id: entity.entity_id,
    name: entity.name,
    state: entity.state,
    domain: "light",
    last_changed: entity.last_changed,
    attributes: {
      brightness_pct: entity.brightness_pct,
      color_temp_kelvin: entity.color_temp_kelvin,
      rgb_color: entity.rgb_color,
      friendly_name: entity.name,
    }
  }));
}

/**
 * Full set of mock entities including lights and other domains.
 */
export const MOCK_ENTITIES: MockHomeAssistantEntity[] = [
  // Light entities (reused from toggle mock)
  ...createMockEntitiesFromLights(),
  
  // Climate entities
  { entity_id: "climate.living_room", name: "Living Room Thermostat", state: "70", domain: "climate", last_changed: new Date().toISOString(), attributes: { temperature: 70, current_temperature: 72, hvac_mode: "auto" } },
  { entity_id: "climate.master_bedroom", name: "Master Bedroom Thermostat", state: "68", domain: "climate", last_changed: new Date().toISOString(), attributes: { temperature: 68, current_temperature: 69, hvac_mode: "auto" } },
  { entity_id: "climate.home_office", name: "Home Office AC", state: "72", domain: "climate", last_changed: new Date().toISOString(), attributes: { temperature: 72, current_temperature: 73, hvac_mode: "cool" } },
  
  // Sensor entities
  { entity_id: "sensor.outdoor_temperature", name: "Outdoor Temperature", state: "65", domain: "sensor", last_changed: new Date().toISOString(), attributes: { unit_of_measurement: "°F", device_class: "temperature" } },
  { entity_id: "sensor.indoor_temperature", name: "Indoor Temperature", state: "71", domain: "sensor", last_changed: new Date().toISOString(), attributes: { unit_of_measurement: "°F", device_class: "temperature" } },
  { entity_id: "sensor.humidity", name: "Indoor Humidity", state: "45", domain: "sensor", last_changed: new Date().toISOString(), attributes: { unit_of_measurement: "%", device_class: "humidity" } },
  { entity_id: "sensor.energy_usage", name: "Energy Usage", state: "2.5", domain: "sensor", last_changed: new Date().toISOString(), attributes: { unit_of_measurement: "kW", device_class: "power" } },
  
  // Switch entities
  { entity_id: "switch.garage_door", name: "Garage Door", state: "closed", domain: "switch", last_changed: new Date().toISOString(), attributes: { device_class: "door" } },
  { entity_id: "switch.outdoor_plugs", name: "Outdoor Plugs", state: "off", domain: "switch", last_changed: new Date().toISOString(), attributes: {} },
  { entity_id: "switch.holiday_lights", name: "Holiday Lights", state: "off", domain: "switch", last_changed: new Date().toISOString(), attributes: {} },
  
  // Media player entities
  { entity_id: "media_player.living_room_tv", name: "Living Room TV", state: "off", domain: "media_player", last_changed: new Date().toISOString(), attributes: { device_class: "tv", volume_level: 0.5 } },
  { entity_id: "media_player.master_bedroom_tv", name: "Master Bedroom TV", state: "off", domain: "media_player", last_changed: new Date().toISOString(), attributes: { device_class: "tv", volume_level: 0.3 } },
  { entity_id: "media_player.kitchen_speaker", name: "Kitchen Speaker", state: "off", domain: "media_player", last_changed: new Date().toISOString(), attributes: { device_class: "speaker", volume_level: 0.6 } },
  
  // Cover entities (blinds, garage door)
  { entity_id: "cover.living_room_blinds", name: "Living Room Blinds", state: "open", domain: "cover", last_changed: new Date().toISOString(), attributes: { current_position: 100, device_class: "blind" } },
  { entity_id: "cover.master_bedroom_blinds", name: "Master Bedroom Blinds", state: "closed", domain: "cover", last_changed: new Date().toISOString(), attributes: { current_position: 0, device_class: "blind" } },
  { entity_id: "cover.kitchen_blinds", name: "Kitchen Blinds", state: "open", domain: "cover", last_changed: new Date().toISOString(), attributes: { current_position: 75, device_class: "blind" } },
  
  // Lock entities
  { entity_id: "lock.front_door", name: "Front Door Lock", state: "locked", domain: "lock", last_changed: new Date().toISOString(), attributes: { device_class: "lock" } },
  { entity_id: "lock.back_door", name: "Back Door Lock", state: "locked", domain: "lock", last_changed: new Date().toISOString(), attributes: { device_class: "lock" } },
  { entity_id: "lock.garage_door", name: "Garage Door Lock", state: "locked", domain: "lock", last_changed: new Date().toISOString(), attributes: { device_class: "lock" } },
  
  // Binary sensor entities (motion, door/window sensors)
  { entity_id: "binary_sensor.front_door_motion", name: "Front Door Motion", state: "off", domain: "binary_sensor", last_changed: new Date().toISOString(), attributes: { device_class: "motion" } },
  { entity_id: "binary_sensor.back_door_motion", name: "Back Door Motion", state: "off", domain: "binary_sensor", last_changed: new Date().toISOString(), attributes: { device_class: "motion" } },
  { entity_id: "binary_sensor.garage_motion", name: "Garage Motion", state: "off", domain: "binary_sensor", last_changed: new Date().toISOString(), attributes: { device_class: "motion" } },
  { entity_id: "binary_sensor.front_door_contact", name: "Front Door Contact", state: "off", domain: "binary_sensor", last_changed: new Date().toISOString(), attributes: { device_class: "door" } },
  { entity_id: "binary_sensor.back_door_contact", name: "Back Door Contact", state: "off", domain: "binary_sensor", last_changed: new Date().toISOString(), attributes: { device_class: "door" } },
  
  // Fan entities
  { entity_id: "fan.master_bedroom", name: "Master Bedroom Fan", state: "off", domain: "fan", last_changed: new Date().toISOString(), attributes: { speed: "off", percentage: 0 } },
  { entity_id: "fan.living_room", name: "Living Room Fan", state: "off", domain: "fan", last_changed: new Date().toISOString(), attributes: { speed: "off", percentage: 0 } },
  { entity_id: "fan.home_office", name: "Home Office Fan", state: "on", domain: "fan", last_changed: new Date().toISOString(), attributes: { speed: "medium", percentage: 50 } },
];

/**
 * Get all mock entities, optionally filtered by domain.
 */
export function getMockEntities(domain?: string): MockHomeAssistantEntity[] {
  if (!domain) {
    return MOCK_ENTITIES;
  }
  
  return MOCK_ENTITIES.filter(entity => entity.domain === domain.toLowerCase());
}

/**
 * Format entities for display in the format: entity_id, name, aliases, state
 */
export function formatMockEntitiesForDisplay(entities: MockHomeAssistantEntity[]): string {
  if (entities.length === 0) {
    return "No entities found matching your criteria.";
  }
  
  const header = "entity_id, name, aliases, state";
  const rows = entities.map(entity => {
    const attributes = entity.attributes;
    const friendlyName = attributes.friendly_name || entity.name;
    return `${entity.entity_id}, ${friendlyName}, , ${entity.state}`;
  });
  
  return [header, ...rows].join("\n");
}

/**
 * Filter entities by regex pattern.
 */
export function filterMockEntitiesByRegex(entities: MockHomeAssistantEntity[], regex: string): MockHomeAssistantEntity[] {
  try {
    const pattern = new RegExp(regex, 'i');
    return entities.filter(entity => {
      const formatted = `${entity.entity_id}, ${entity.name}, , ${entity.state}`;
      return pattern.test(formatted);
    });
  } catch (error) {
    return [];
  }
}

/**
 * Create the mock list Home Assistant entities tool for guest mode.
 */
export function createMockListHAEntitiesTool() {
  return tool(
    async ({ domain, regex }: { domain?: string; regex?: string }) => {
      let entities = getMockEntities(domain);
      
      if (regex) {
        entities = filterMockEntitiesByRegex(entities, regex);
      }
      
      const formatted = formatMockEntitiesForDisplay(entities);
      return `[Demo] Home Assistant entities (demo mode for guests - no actual device control)\n\n${formatted}`;
    },
    {
      name: "list_home_assistant_entities",
      description: `List Home Assistant entities with optional filtering (demo mode for guests - no actual device control).

This mock tool provides a static set of fake entities organized by room.
All responses indicate they are in demo mode.

Supported domains: light, climate, sensor, switch, media_player, cover, lock, binary_sensor, fan
Naming convention for lights: light.[room_name]_[light_name]

Examples:
- light.living_room_ceiling - Living Room Ceiling
- climate.living_room - Living Room Thermostat
- switch.garage_door - Garage Door

Use domain parameter to filter by entity type (e.g., 'light', 'climate').
Use regex parameter to filter by entity_id, name, or state.`,
      
      schema: z.object({
        domain: z.string().optional().describe("Filter entities by domain (e.g., 'light', 'sensor', 'climate')"),
        regex: z.string().optional().describe("Filter entities using regex pattern matching against 'entity_id, name, aliases, state' format")
      })
    }
  );
}

/**
 * The mock list HA entities tool factory for guest mode.
 */
export const mockListHAEntitiesToolFactory: ToolFactory = async () => {
  const mockTool = createMockListHAEntitiesTool();
  return { ok: true, tool: mockTool };
};
