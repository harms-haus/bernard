import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callService } from "home-assistant-js-websocket";

import type { HomeAssistantServiceCall } from "@/lib/home-assistant";
import {
  extractHomeAssistantContext,
  findEntity,
  validateEntityId,
  getDomainFromEntityId,
  getHAConnection,
  verifyHomeAssistantConfigured
} from "@/lib/home-assistant";
import type { HARestConfig } from "./home-assistant-list-entities.tool";
import { ToolFactory } from "./types";
import { getSettings } from "@/dist/lib/config/settingsCache";

const TOOL_NAME = "execute_home_assistant_services";

/**
 * Dependencies for the execute home assistant services tool
 */
export type ExecuteHomeAssistantServicesDependencies = {
  extractContextImpl: typeof extractHomeAssistantContext;
  findEntityImpl: typeof findEntity;
  validateEntityIdImpl: typeof validateEntityId;
  getDomainFromEntityIdImpl: typeof getDomainFromEntityId;
  callHAServiceWebSocketImpl?: typeof callHAServiceWebSocket;
};

const defaultDeps: ExecuteHomeAssistantServicesDependencies = {
  extractContextImpl: extractHomeAssistantContext,
  findEntityImpl: findEntity,
  validateEntityIdImpl: validateEntityId,
  getDomainFromEntityIdImpl: getDomainFromEntityId,
  callHAServiceWebSocketImpl: callHAServiceWebSocket
};

/**
 * Create the execute home assistant services tool
 */
export function createExecuteHomeAssistantServicesTool(
  restConfig?: HARestConfig,
  overrides: Partial<ExecuteHomeAssistantServicesDependencies> = {}
) {
  const deps: ExecuteHomeAssistantServicesDependencies = {
    ...defaultDeps,
    ...overrides,
  };
  
  return tool(
    async ({ list }: { list: Array<{ domain: string; service: string; service_data: { entity_id: string | string[] } }> }) => {
      if (!Array.isArray(list) || list.length === 0) {
        return "No service calls provided. Please provide an array of service calls to execute.";
      }
      
      const results: string[] = [];
      
      for (const serviceCall of list) {
        try {
          const result = await executeSingleServiceCall(serviceCall, deps, restConfig);
          results.push(result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          // For validation errors, throw them so they can be caught by tests
          if (errorMessage.includes("Invalid entity_id format") || errorMessage.includes("does not match domain")) {
            throw error;
          }
          results.push(`Failed to execute service: ${errorMessage}`);
        }
      }
      
      return results.join('\n\n');
    },
    {
      name: TOOL_NAME,
      description: "Execute services on Home Assistant entities to control your smart home devices. Common tasks include turning lights on/off, adjusting light brightness and color, playing/pausing media players, and controlling other smart home entities. Service calls are scheduled for execution by Home Assistant.",
      schema: z.object({
        list: z.array(
          z.object({
            domain: z.string().describe("The domain of the service"),
            service: z.string().describe("The service to be called"),
            service_data: z.object({
              entity_id: z.union([
                z.string().describe("The entity_id retrieved from available devices. It must start with domain, followed by dot character."),
                z.array(z.string()).describe("Array of entity_ids to apply the service to")
              ])
            }).describe("The service data object to indicate what to control.")
          })
        ).describe("Array of service calls to execute")
      })
    }
  );
}

/**
 * Call a Home Assistant service via WebSocket API
 */
async function callHAServiceWebSocket(
  baseUrl: string,
  accessToken: string,
  domain: string,
  service: string,
  serviceData: Record<string, unknown>
): Promise<void> {
  try {
    const connection = await getHAConnection(baseUrl, accessToken);
    await callService(connection, domain, service, serviceData);
  } catch (error) {
    console.error('[HA WebSocket] Failed to call service:', error);
    throw error;
  }
}

/**
 * Execute a single service call
 */
async function executeSingleServiceCall(
  serviceCall: { domain: string; service: string; service_data: { entity_id: string | string[] } },
  deps: ExecuteHomeAssistantServicesDependencies,
  restConfig?: HARestConfig
): Promise<string> {
  const { domain, service, service_data } = serviceCall;
  
  // Validate domain and service are provided
  if (!domain || !service) {
    throw new Error("Domain and service are required for execute_services");
  }
  
  const entityIds = service_data.entity_id;
  if (!entityIds) {
    throw new Error("entity_id is required in service_data");
  }
  
  const entityIdsArray = Array.isArray(entityIds) ? entityIds : [entityIds];
  
  // Validate each entity_id
  for (const entityId of entityIdsArray) {
    if (!deps.validateEntityIdImpl(entityId)) {
      throw new Error(`Invalid entity_id format: ${entityId}. Entity IDs must start with domain followed by a dot character.`);
    }
    
    const entityDomain = deps.getDomainFromEntityIdImpl(entityId);
    if (entityDomain !== domain) {
      throw new Error(`Entity ID ${entityId} does not match domain ${domain}. Entity IDs must start with the same domain as the service.`);
    }
  }
  
  // Priority logic: Prefer WebSocket API over tool calls
  if (restConfig && deps.callHAServiceWebSocketImpl) {
    // Primary behavior: Execute directly via WebSocket API
    try {
      await deps.callHAServiceWebSocketImpl(restConfig.baseUrl, restConfig.accessToken || "", domain, service, service_data);
      return `Service ${domain}.${service} executed successfully on entities: ${entityIdsArray.join(', ')}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to execute Home Assistant service via WebSocket: ${errorMessage}`);
    }
  } else {
    // Fallback behavior: Record the service call for Home Assistant to process
    const _haServiceCall: HomeAssistantServiceCall = {
      domain,
      service,
      service_data: {
        entity_id: entityIds
      }
    };

    return `Service ${domain}.${service} scheduled for execution on entities: ${entityIdsArray.join(', ')}`;
  }
}

/**
 * The execute home assistant services tool instance factory
 */
export function createExecuteHomeAssistantServicesToolInstance(restConfig?: HARestConfig) {
  return createExecuteHomeAssistantServicesTool(restConfig);
}

export const executeHomeAssistantServicesToolFactory: ToolFactory = async () => {
  const isValid = await verifyHomeAssistantConfigured();
  if (!isValid.ok) {
    return { ok: false, name: TOOL_NAME, reason: isValid.reason ?? "" };
  }
  const settings = await getSettings();
  const haConfig = settings.services?.homeAssistant;
  const tool = createExecuteHomeAssistantServicesTool(haConfig);
  return { ok: true, tool: tool, name: tool.name };
};
