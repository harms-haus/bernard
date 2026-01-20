import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolFactory } from "../types";

/**
 * Mock Home Assistant light entity for guest mode demo.
 */
export interface MockLightEntity {
  entity_id: string;
  name: string;
  state: "on" | "off";
  brightness_pct: number;
  color_temp_kelvin?: number;
  rgb_color?: { r: number; g: number; b: number };
  last_changed: string;
}

/**
 * Static set of mock light entities organized by room.
 * Believable smart home setup with realistic naming convention: light.[room_name]_[light_name]
 */
export const MOCK_LIGHT_ENTITIES: MockLightEntity[] = [
  // Living Areas
  { entity_id: "light.living_room_ceiling", name: "Living Room Ceiling", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.living_room_floor_lamp", name: "Living Room Floor Lamp", state: "off", brightness_pct: 75, last_changed: new Date().toISOString() },
  { entity_id: "light.living_room_reading_lamp", name: "Living Room Reading Lamp", state: "off", brightness_pct: 60, last_changed: new Date().toISOString() },
  { entity_id: "light.living_room_tv_backlight", name: "Living Room TV Backlight", state: "off", brightness_pct: 50, rgb_color: { r: 0, g: 100, b: 200 }, last_changed: new Date().toISOString() },
  { entity_id: "light.living_room_fireplace", name: "Living Room Fireplace", state: "off", brightness_pct: 80, color_temp_kelvin: 2200, last_changed: new Date().toISOString() },

  // Family Room
  { entity_id: "light.family_room_overhead", name: "Family Room Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.family_room_accent_lights", name: "Family Room Accent Lights", state: "off", brightness_pct: 60, rgb_color: { r: 255, g: 200, b: 150 }, last_changed: new Date().toISOString() },
  { entity_id: "light.family_room_media_center", name: "Family Room Media Center", state: "off", brightness_pct: 40, last_changed: new Date().toISOString() },
  { entity_id: "light.family_room_bookshelf", name: "Family Room Bookshelf", state: "off", brightness_pct: 70, last_changed: new Date().toISOString() },

  // Kitchen
  { entity_id: "light.kitchen_overhead", name: "Kitchen Overhead", state: "on", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.kitchen_under_cabinet", name: "Kitchen Under Cabinet", state: "on", brightness_pct: 80, last_changed: new Date().toISOString() },
  { entity_id: "light.kitchen_island", name: "Kitchen Island", state: "off", brightness_pct: 90, last_changed: new Date().toISOString() },
  { entity_id: "light.kitchen_pantry", name: "Kitchen Pantry", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.kitchen_nightlight", name: "Kitchen Nightlight", state: "off", brightness_pct: 20, color_temp_kelvin: 2700, last_changed: new Date().toISOString() },

  // Dining Room
  { entity_id: "light.dining_room_chandelier", name: "Dining Room Chandelier", state: "off", brightness_pct: 100, color_temp_kelvin: 2700, last_changed: new Date().toISOString() },
  { entity_id: "light.dining_room_wall_sconces", name: "Dining Room Wall Sconces", state: "off", brightness_pct: 60, last_changed: new Date().toISOString() },
  { entity_id: "light.dining_room_buffet_lamp", name: "Dining Room Buffet Lamp", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },

  // Breakfast Nook
  { entity_id: "light.breakfast_nook_main", name: "Breakfast Nook Main", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.breakfast_nook_pendants", name: "Breakfast Nook Pendants", state: "off", brightness_pct: 80, last_changed: new Date().toISOString() },

  // Master Bedroom
  { entity_id: "light.master_bedroom_ceiling", name: "Master Bedroom Ceiling", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bedroom_nightstand_left", name: "Master Bedroom Nightstand Left", state: "off", brightness_pct: 40, color_temp_kelvin: 2700, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bedroom_nightstand_right", name: "Master Bedroom Nightstand Right", state: "off", brightness_pct: 40, color_temp_kelvin: 2700, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bedroom_walkin_closet", name: "Master Bedroom Walk-in Closet", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bedroom_bathroom", name: "Master Bedroom Bathroom", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bedroom_vanity", name: "Master Bedroom Vanity", state: "off", brightness_pct: 90, color_temp_kelvin: 4000, last_changed: new Date().toISOString() },

  // Guest Bedroom
  { entity_id: "light.guest_bedroom_ceiling", name: "Guest Bedroom Ceiling", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.guest_bedroom_bedside", name: "Guest Bedroom Bedside", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },
  { entity_id: "light.guest_bedroom_closet", name: "Guest Bedroom Closet", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },

  // Kids Bedroom
  { entity_id: "light.kids_bedroom_ceiling", name: "Kids Bedroom Ceiling", state: "on", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.kids_bedroom_desk", name: "Kids Bedroom Desk", state: "off", brightness_pct: 80, last_changed: new Date().toISOString() },
  { entity_id: "light.kids_bedroom_nightlight", name: "Kids Bedroom Nightlight", state: "off", brightness_pct: 15, color_temp_kelvin: 2700, last_changed: new Date().toISOString() },
  { entity_id: "light.kids_bedroom_reading", name: "Kids Bedroom Reading", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },

  // Nursery
  { entity_id: "light.nursery_ceiling", name: "Nursery Ceiling", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.nursery_dimmer", name: "Nursery Dimmer", state: "off", brightness_pct: 30, last_changed: new Date().toISOString() },
  { entity_id: "light.nursery_nightlight", name: "Nursery Nightlight", state: "off", brightness_pct: 10, color_temp_kelvin: 2200, last_changed: new Date().toISOString() },
  { entity_id: "light.nursery_changing_table", name: "Nursery Changing Table", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },

  // Master Bathroom
  { entity_id: "light.master_bath_overhead", name: "Master Bath Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bath_vanity", name: "Master Bath Vanity", state: "off", brightness_pct: 90, color_temp_kelvin: 4000, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bath_shower", name: "Master Bath Shower", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.master_bath_toilet", name: "Master Bath Toilet", state: "off", brightness_pct: 30, last_changed: new Date().toISOString() },

  // Guest Bathroom
  { entity_id: "light.guest_bath_overhead", name: "Guest Bath Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.guest_bath_mirror", name: "Guest Bath Mirror", state: "off", brightness_pct: 80, last_changed: new Date().toISOString() },

  // Kids Bathroom
  { entity_id: "light.kids_bath_overhead", name: "Kids Bath Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.kids_bath_nightlight", name: "Kids Bath Nightlight", state: "on", brightness_pct: 20, color_temp_kelvin: 2700, last_changed: new Date().toISOString() },

  // Home Office
  { entity_id: "light.home_office_desk_lamp", name: "Home Office Desk Lamp", state: "on", brightness_pct: 80, color_temp_kelvin: 4000, last_changed: new Date().toISOString() },
  { entity_id: "light.home_office_overhead", name: "Home Office Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.home_office_accent", name: "Home Office Accent", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },
  { entity_id: "light.home_office_bookcase", name: "Home Office Bookcase", state: "off", brightness_pct: 60, last_changed: new Date().toISOString() },

  // Study
  { entity_id: "light.study_main_light", name: "Study Main Light", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.study_desk_lamp", name: "Study Desk Lamp", state: "off", brightness_pct: 70, color_temp_kelvin: 3500, last_changed: new Date().toISOString() },
  { entity_id: "light.study_floor_lamp", name: "Study Floor Lamp", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },

  // Garage
  { entity_id: "light.garage_overhead", name: "Garage Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.garage_workbench", name: "Garage Workbench", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.garage_door", name: "Garage Door", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.garage_driveway", name: "Garage Driveway", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },

  // Basement
  { entity_id: "light.basement_overhead", name: "Basement Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.basement_recreation", name: "Basement Recreation", state: "off", brightness_pct: 80, last_changed: new Date().toISOString() },
  { entity_id: "light.basement_workshop", name: "Basement Workshop", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.basement_storage", name: "Basement Storage", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.basement_stairs", name: "Basement Stairs", state: "off", brightness_pct: 30, last_changed: new Date().toISOString() },

  // Laundry Room
  { entity_id: "light.laundry_overhead", name: "Laundry Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.laundry_ironing", name: "Laundry Ironing", state: "off", brightness_pct: 80, last_changed: new Date().toISOString() },

  // Hallways
  { entity_id: "light.hallway_upstairs", name: "Hallway Upstairs", state: "off", brightness_pct: 60, last_changed: new Date().toISOString() },
  { entity_id: "light.hallway_downstairs", name: "Hallway Downstairs", state: "off", brightness_pct: 60, last_changed: new Date().toISOString() },
  { entity_id: "light.hallway_master", name: "Hallway Master", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },

  // Entryway
  { entity_id: "light.entryway_ceiling", name: "Entryway Ceiling", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.entryway_table_lamp", name: "Entryway Table Lamp", state: "off", brightness_pct: 60, last_changed: new Date().toISOString() },
  { entity_id: "light.entryway_coat_closet", name: "Entryway Coat Closet", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },

  // Patio/Deck
  { entity_id: "light.patio_string_lights", name: "Patio String Lights", state: "off", brightness_pct: 70, color_temp_kelvin: 2200, last_changed: new Date().toISOString() },
  { entity_id: "light.patio_overhead", name: "Patio Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.patio_lanterns", name: "Patio Lanterns", state: "off", brightness_pct: 60, last_changed: new Date().toISOString() },

  // Backyard
  { entity_id: "light.backyard_floodlights", name: "Backyard Floodlights", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.backyard_pathway", name: "Backyard Pathway", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },
  { entity_id: "light.backyard_tree_spots", name: "Backyard Tree Spots", state: "off", brightness_pct: 70, last_changed: new Date().toISOString() },

  // Front Yard
  { entity_id: "light.front_porch", name: "Front Porch", state: "on", brightness_pct: 80, last_changed: new Date().toISOString() },
  { entity_id: "light.front_door_spotlight", name: "Front Door Spotlight", state: "on", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.front_walkway", name: "Front Walkway", state: "off", brightness_pct: 50, last_changed: new Date().toISOString() },
  { entity_id: "light.front_gate", name: "Front Gate", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },

  // Driveway
  { entity_id: "light.driveway_overhead", name: "Driveway Overhead", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
  { entity_id: "light.driveway_motion", name: "Driveway Motion", state: "off", brightness_pct: 100, last_changed: new Date().toISOString() },
];

/**
 * Get mock light entities, optionally filtered by room name.
 */
export function getMockLightEntities(roomFilter?: string): MockLightEntity[] {
  if (!roomFilter) {
    return MOCK_LIGHT_ENTITIES;
  }

  const normalizedRoom = roomFilter.toLowerCase().replace(/\s+/g, '_');
  return MOCK_LIGHT_ENTITIES.filter(entity => {
    const entityRoom = entity.entity_id.split('.')[1].split('_')[0];
    return entityRoom === normalizedRoom ||
      entity.entity_id.includes(`.${normalizedRoom}_`) ||
      entity.entity_id.includes(`_${normalizedRoom}_`);
  });
}

/**
 * Find a specific mock light entity by entity_id.
 */
export function findMockLightEntity(entityId: string): MockLightEntity | undefined {
  return MOCK_LIGHT_ENTITIES.find(entity => entity.entity_id === entityId);
}

/**
 * Toggle a mock light entity's state.
 */
export function toggleMockLight(entityId: string, on?: boolean | null, brightness_pct?: number | null): string {
  const entity = findMockLightEntity(entityId);

  if (!entity) {
    return `Error: Light entity ${entityId} not found in mock Home Assistant`;
  }

  const isCurrentlyOn = entity.state === "on";
  let newState: "on" | "off";
  let action: string;

  if (on === true) {
    newState = "on";
    action = "turned on";
  } else if (on === false) {
    newState = "off";
    action = "turned off";
  } else if (on === null) {
    newState = isCurrentlyOn ? "off" : "on";
    action = isCurrentlyOn ? "turned off" : "turned on";
  } else {
    // on is undefined - toggle behavior
    newState = isCurrentlyOn ? "off" : "on";
    action = isCurrentlyOn ? "turned off" : "turned on";
  }

  // Update entity state
  entity.state = newState;
  entity.last_changed = new Date().toISOString();

  if (brightness_pct !== undefined && brightness_pct !== null) {
    entity.brightness_pct = Math.max(0, Math.min(100, brightness_pct));
  }

  let response = `[Demo] Light ${entity.name} ${action}`;

  if (entity.state === "on" && entity.brightness_pct !== undefined) {
    response += ` to ${entity.brightness_pct}% brightness`;
  }

  return response + " (demo mode for guests)";
}

/**
 * Create the mock toggle home assistant light tool for guest mode.
 */
export function createMockToggleLightTool() {
  return tool(
    async ({ entity, on, brightness_pct, color }: {
      entity: string;
      on?: boolean | null;
      brightness_pct?: number | null;
      color?: string | number | { r: number; g: number; b: number } | null;
    }) => {
      // Validate entity_id format and domain
      if (!entity || typeof entity !== "string") {
        return "Error: entity parameter is required and must be a string";
      }

      const entityParts = entity.split(".");
      if (entityParts.length !== 2) {
        return `Error: Invalid entity_id format: ${entity}. Entity IDs must be in format 'domain.entity_name'`;
      }

      const [domain] = entityParts;
      if (domain !== "light") {
        return `Error: Entity ${entity} is not a light. Only light entities are supported by this tool.`;
      }

      const result = toggleMockLight(entity, on, brightness_pct);
      
      if (color !== undefined && color !== null) {
        return `${result} with color: ${JSON.stringify(color)}`;
      }
      
      return result;
    },
    {
      name: "toggle_home_assistant_light",
      description: `Control Home Assistant lights (demo mode for guests - no actual device control).

This mock tool simulates light control with a static set of fake entities organized by room.
All responses indicate they are in demo mode.

Rooms include: living room, family room, kitchen, dining room, breakfast nook, master bedroom, guest bedroom, kids bedroom, nursery, master bath, guest bath, kids bath, home office, study, garage, basement, laundry, hallways, entryway, patio, backyard, front yard, driveway.

Naming convention: light.[room_name]_[light_name] (e.g., light.living_room_ceiling, light.kitchen_under_cabinet)`,

      schema: z.object({
        entity: z.string().describe("The light entity_id to control (e.g., 'light.living_room_ceiling', 'light.kitchen_under_cabinet', 'light.master_bedroom_nightstand_left')"),
        on: z.union([z.boolean(), z.string()]).nullable().optional().transform((val): boolean | null => {
          if (val === null || val === undefined) return null;
          if (typeof val === "boolean") return val;
          const normalized = val.toLowerCase();
          if (normalized === "true" || normalized === "on") return true;
          if (normalized === "false" || normalized === "off") return false;
          throw new Error(`Invalid boolean value: ${val}`);
        }).describe("true/on=turn on, false/off=turn off, null=toggle (default: toggle if off, adjust if on)"),
        brightness_pct: z.number().nullable().optional().describe("Set brightness as percentage (0-100), null to leave unchanged"),
        color: z.union([
          z.string().describe("Color name (e.g., 'red', 'blue', 'warm white')"),
          z.number().describe("Color temperature in Kelvin (e.g., 2700 for warm white)"),
          z.object({
            r: z.number().min(0).max(255),
            g: z.number().min(0).max(255),
            b: z.number().min(0).max(255)
          }).describe("RGB color values"),
        ]).nullable().optional().describe("Color to set (mock mode ignores color, just shows in response)")
      })
    }
  );
}

/**
 * The mock toggle light tool factory for guest mode.
 */
export const mockToggleLightToolFactory: ToolFactory = async () => {
  const mockTool = createMockToggleLightTool();
  return { ok: true, tool: mockTool, name: mockTool.name };
};
