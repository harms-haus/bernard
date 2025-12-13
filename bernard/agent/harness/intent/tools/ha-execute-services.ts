import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HomeAssistantEntity, HomeAssistantServiceCall } from "./ha-entities";
import type { HomeAssistantContextManager } from "./ha-context";
import {
  extractHomeAssistantContext,
  findEntity,
  validateEntityId,
  getDomainFromEntityId
} from "./ha-entities";

/**
 * Dependencies for the execute services tool
 */
export type ExecuteServicesDependencies = {
  extractContextImpl: typeof extractHomeAssistantContext;
  findEntityImpl: typeof findEntity;
  validateEntityIdImpl: typeof validateEntityId;
  getDomainFromEntityIdImpl: typeof getDomainFromEntityId;
  recordServiceCallImpl: (serviceCall: HomeAssistantServiceCall) => void | Promise<void>;
};

const defaultDeps: ExecuteServicesDependencies = {
  extractContextImpl: extractHomeAssistantContext,
  findEntityImpl: findEntity,
  validateEntityIdImpl: validateEntityId,
  getDomainFromEntityIdImpl: getDomainFromEntityId,
  recordServiceCallImpl: () => {
    throw new Error("recordServiceCallImpl must be provided via dependencies");
  }
};

/**
 * Create the execute services tool
 */
export function createExecuteServicesTool(
  haContextManager: HomeAssistantContextManager,
  overrides: Partial<ExecuteServicesDependencies> = {}
) {
  const deps: ExecuteServicesDependencies = {
    ...defaultDeps,
    ...overrides,
    recordServiceCallImpl: (serviceCall: HomeAssistantServiceCall) => {
      haContextManager.recordServiceCall(serviceCall);
    }
  };
  
  return tool(
    async ({ list }: { list: Array<{ domain: string; service: string; service_data: { entity_id: string | string[] } }> }) => {
      if (!Array.isArray(list) || list.length === 0) {
        return "No service calls provided. Please provide an array of service calls to execute.";
      }
      
      const results: string[] = [];
      
      for (const serviceCall of list) {
        try {
          const result = await executeSingleServiceCall(serviceCall, deps);
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
      name: "execute_services",
      description: "Execute services of devices in Home Assistant. Returns true immediately but records service calls for Home Assistant to manage.",
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
 * Execute a single service call
 */
async function executeSingleServiceCall(
  serviceCall: { domain: string; service: string; service_data: { entity_id: string | string[] } },
  deps: ExecuteServicesDependencies
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
  
  // Record the service call for Home Assistant to process
  const haServiceCall: HomeAssistantServiceCall = {
    domain,
    service,
    service_data: {
      entity_id: entityIds
    }
  };
  
  await deps.recordServiceCallImpl(haServiceCall);
  
  return `Service ${domain}.${service} scheduled for execution on entities: ${entityIdsArray.join(', ')}`;
}

/**
 * The execute services tool instance factory
 */
export function createExecuteServicesToolInstance(haContextManager: HomeAssistantContextManager) {
  return createExecuteServicesTool(haContextManager);
}

/**
 * Service call storage for recording calls
 */
export class ServiceCallRecorder {
  private serviceCalls: HomeAssistantServiceCall[] = [];
  
  record(serviceCall: HomeAssistantServiceCall): void {
    this.serviceCalls.push(serviceCall);
  }
  
  getRecordedCalls(): HomeAssistantServiceCall[] {
    return [...this.serviceCalls];
  }
  
  clear(): void {
    this.serviceCalls = [];
  }
}