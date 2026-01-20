import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolFactory } from "../types";
import { findMockLightEntity, MOCK_LIGHT_ENTITIES } from "./home-assistant-toggle-light.mock.tool";
import { MOCK_ENTITIES } from "./home-assistant-list-entities.mock.tool";

/**
 * Mock service call result.
 */
export interface MockServiceResult {
  domain: string;
  service: string;
  entity_id: string;
  success: boolean;
  message: string;
}

/**
 * Validate entity_id format.
 */
function validateMockEntityId(entityId: string): boolean {
  if (!entityId || typeof entityId !== "string") return false;
  const parts = entityId.split(".");
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

/**
 * Get domain from entity_id.
 */
function getDomainFromMockEntityId(entityId: string): string {
  const parts = entityId.split(".");
  return parts[0] || "";
}

/**
 * Execute a single mock service call.
 */
function executeMockServiceCall(
  domain: string,
  service: string,
  entityId: string
): MockServiceResult {
  // Validate entity_id format
  if (!validateMockEntityId(entityId)) {
    return {
      domain,
      service,
      entity_id: entityId,
      success: false,
      message: `Invalid entity_id format: ${entityId}. Entity IDs must start with domain followed by a dot character.`
    };
  }
  
  // Validate domain matches entity
  const entityDomain = getDomainFromMockEntityId(entityId);
  if (entityDomain !== domain) {
    return {
      domain,
      service,
      entity_id: entityId,
      success: false,
      message: `Entity ID ${entityId} does not match domain ${domain}. Entity IDs must start with the same domain as the service.`
    };
  }
  
  // For lights, verify the entity exists in our mock data
  if (domain === "light") {
    const entity = findMockLightEntity(entityId);
    if (!entity) {
      return {
        domain,
        service,
        entity_id: entityId,
        success: false,
        message: `Entity ${entityId} not found in mock Home Assistant`
      };
    }
    
    // Update mock entity state based on service
    if (service === "turn_on") {
      entity.state = "on";
      entity.last_changed = new Date().toISOString();
    } else if (service === "turn_off") {
      entity.state = "off";
      entity.last_changed = new Date().toISOString();
    } else if (service === "toggle") {
      entity.state = entity.state === "on" ? "off" : "on";
      entity.last_changed = new Date().toISOString();
    }
    
    // Return success for light entities
    return {
      domain,
      service,
      entity_id: entityId,
      success: true,
      message: `[Demo] Service ${domain}.${service} executed successfully on ${entityId} (demo mode for guests)`
    };
  }
  
  // For non-light domains, verify entity exists
  const entityExists = MOCK_ENTITIES.some(e => e.entity_id === entityId);
  if (!entityExists) {
    return {
      domain,
      service,
      entity_id: entityId,
      success: false,
      message: `Entity ${entityId} not found in mock Home Assistant`
    };
  }
  
  // Simulate service execution
  return {
    domain,
    service,
    entity_id: entityId,
    success: true,
    message: `[Demo] Service ${domain}.${service} executed successfully on ${entityId} (demo mode for guests)`
  };
}

/**
 * Create the mock execute Home Assistant services tool for guest mode.
 */
export function createMockExecuteHomeAssistantServicesTool() {
  return tool(
    async ({ list }: { 
      list: Array<{ 
        domain: string; 
        service: string; 
        service_data: { 
          entity_id: string | string[] 
        } 
      }> 
    }) => {
      if (!Array.isArray(list) || list.length === 0) {
        return "No service calls provided.";
      }
      
      const results: string[] = [];
      
      for (const serviceCall of list) {
        const { domain, service, service_data } = serviceCall;
        
        // Validate domain and service
        if (!domain || !service) {
          results.push("Error: Domain and service are required for execute_services");
          continue;
        }
        
        if (!service_data) {
          results.push("Error: service_data is required in service_call");
          continue;
        }
        
        const entityIds = service_data.entity_id;
        if (!entityIds) {
          results.push("Error: entity_id is required in service_data");
          continue;
        }
        
        const entityIdsArray = Array.isArray(entityIds) ? entityIds : [entityIds];
        
        // Execute service for each entity
        for (const entityId of entityIdsArray) {
          const result = executeMockServiceCall(domain, service, entityId);
          
          if (result.success) {
            results.push(result.message);
          } else {
            results.push(`Error: ${result.message}`);
          }
        }
      }
      
      return results.join("\n");
    },
    {
      name: "execute_home_assistant_services",
      description: `Execute services on Home Assistant entities to control your smart home devices (demo mode for guests - no actual device control).

This mock tool simulates service execution with a static set of fake entities.
All responses indicate they are in demo mode.

Supported domains and services:
- light: turn_on, turn_off, toggle (supports brightness, color via service_data)
- climate: set_temperature, set_hvac_mode
- switch: turn_on, turn_off, toggle
- cover: open_cover, close_cover, set_cover_position
- lock: lock, unlock
- media_player: turn_on, turn_off, play, pause, volume_set

Naming convention: light.[room_name]_[light_name] (e.g., light.living_room_ceiling)

Example service calls:
- { domain: "light", service: "turn_on", service_data: { entity_id: "light.living_room_ceiling" } }
- { domain: "switch", service: "turn_on", service_data: { entity_id: "switch.garage_door" } }
- { domain: "lock", service: "lock", service_data: { entity_id: "lock.front_door" } }`,
      
      schema: z.object({
        list: z.array(
          z.object({
            domain: z.string().describe("The domain of the service (e.g., 'light', 'switch', 'lock')"),
            service: z.string().describe("The service to be called (e.g., 'turn_on', 'turn_off', 'lock')"),
            service_data: z.object({
              entity_id: z.union([
                z.string().describe("The entity_id (e.g., 'light.living_room_ceiling')"),
                z.array(z.string()).describe("Array of entity_ids")
              ])
            }).describe("The service data object indicating what to control")
          })
        ).describe("Array of service calls to execute")
      })
    }
  );
}

/**
 * The mock execute Home Assistant services tool factory for guest mode.
 */
export const mockExecuteHomeAssistantServicesToolFactory: ToolFactory = async () => {
  const mockTool = createMockExecuteHomeAssistantServicesTool();
  return { ok: true, tool: mockTool, name: mockTool.name };
};
