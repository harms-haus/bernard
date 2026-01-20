import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callService } from "home-assistant-js-websocket";

import type { HARestConfig } from "./home-assistant-list-entities.tool";
import {
  type HomeAssistantServiceCall,
  type ColorInput,
  getHAConnection,
  getEntityState,
  getCurrentBrightness,
  getSupportedColorModes,
  convertColorToSupportedFormat,
  getExampleColorNames,
  verifyHomeAssistantConfigured
} from "@/lib/home-assistant";
import { ToolFactory, ToolContext } from "./types";
import { getSettings } from "@/lib/config/settingsCache";
import { logger } from "@/lib/logging";

const TOOL_NAME = "toggle_home_assistant_light";

/**
 * Create a mock toggle light tool for guests.
 * Returns simulated success responses instead of actual HA calls.
 */
function createMockToggleLightTool() {
  return tool(
    async ({ entity, on, brightness_pct, color }: {
      entity: string;
      on?: boolean | null;
      brightness_pct?: number | null;
      color?: string | number | { r: number; g: number; b: number } | null;
    }) => {
      if (!entity || typeof entity !== 'string') {
        return "Error: entity parameter is required and must be a string";
      }

      const entityParts = entity.split('.');
      if (entityParts.length !== 2) {
        return `Error: Invalid entity_id format: ${entity}. Entity IDs must be in format 'domain.entity_name'`;
      }

      const [domain] = entityParts;
      if (domain !== 'light') {
        return `Error: Entity ${entity} is not a light. Only light entities are supported by this tool.`;
      }

      // Build mock response
      let action = 'toggled';
      if (on === true) action = 'turned on';
      else if (on === false) action = 'turned off';

      let response = `[Demo] Light ${entity} ${action}`;

      if (brightness_pct !== undefined && brightness_pct !== null) {
        response += ` to ${brightness_pct}% brightness`;
      }

      if (color !== undefined && color !== null) {
        response += ` with color: ${JSON.stringify(color)}`;
      }

      return response + " (demo mode for guests - no actual device control)";
    },
    {
      name: TOOL_NAME,
      description: "Control Home Assistant lights (demo mode for guests - no actual device control)",
      schema: z.object({
        entity: z.string().describe("The light entity_id to control"),
        on: z.union([z.boolean(), z.string()]).nullable().optional().transform((val): boolean | null => {
          if (val === null || val === undefined) return null;
          if (typeof val === 'boolean') return val;
          const normalized = val.toLowerCase();
          if (normalized === 'true' || normalized === 'on') return true;
          if (normalized === 'false' || normalized === 'off') return false;
          throw new Error(`Invalid boolean value: ${val}`);
        }).describe("true/on=turn on, false/off=turn off, null=toggle"),
        brightness_pct: z.number().nullable().optional().describe("Set brightness as percentage (0-100)"),
        color: z.union([
          z.string().describe("Color name"),
          z.number().describe("Color temperature in Kelvin"),
          z.object({
            r: z.number().min(0).max(255),
            g: z.number().min(0).max(255),
            b: z.number().min(0).max(255)
          }).describe("RGB color values"),
        ]).nullable().optional().describe("Color to set")
      })
    }
  );
}

/**
 * Dependencies for the toggle light tool
 */
export type ToggleLightDependencies = {
  getEntityStateImpl: typeof getEntityState;
  convertColorImpl: typeof convertColorToSupportedFormat;
  recordServiceCallImpl: (serviceCall: HomeAssistantServiceCall) => void | Promise<void>;
  callHAServiceWebSocketImpl?: typeof callHAServiceWebSocket;
};

const defaultDeps: ToggleLightDependencies = {
  getEntityStateImpl: getEntityState,
  convertColorImpl: convertColorToSupportedFormat,
  recordServiceCallImpl: () => {
    throw new Error("recordServiceCallImpl must be provided via dependencies");
  },
  callHAServiceWebSocketImpl: callHAServiceWebSocket
};

/**
 * Call a Home Assistant service via WebSocket API (internal function)
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
    logger.error({ error: (error as Error).message, domain, service }, 'HA WebSocket service call failed');
    throw error;
  }
}

/**
 * Create the toggle home assistant light tool
 */
export function createToggleLightTool(
  restConfig?: HARestConfig,
  overrides: Partial<ToggleLightDependencies> = {}
) {
  const deps: ToggleLightDependencies = {
    ...defaultDeps,
    ...overrides,
  };

  return tool(
    async ({
      entity,
      on,
      brightness_pct,
      brightness_pct_delta,
      color,
      _userRole,
    }: {
      entity: string;
      on?: boolean | null;
      brightness_pct?: number | null;
      brightness_pct_delta?: number | null;
      color?: ColorInput | null;
      _userRole?: string;
    }) => {
      // Check userRole at runtime - if guest, return mock data
      if (_userRole === 'guest' || restConfig === undefined) {
        if (!entity || typeof entity !== 'string') {
          return "[Demo] Error: entity parameter is required and must be a string";
        }
        const action = on === true ? "turn on" : on === false ? "turn off" : "toggle";
        return `[Demo] Light ${entity} - ${action} (demo mode for guests - no actual device control)`;
      }
      
      // Validate entity_id format and domain
      if (!entity || typeof entity !== 'string') {
        return "Error: entity parameter is required and must be a string";
      }

      const entityParts = entity.split('.');
      if (entityParts.length !== 2) {
        return `Error: Invalid entity_id format: ${entity}. Entity IDs must be in format 'domain.entity_name'`;
      }

      const [domain] = entityParts;
      if (domain !== 'light') {
        return `Error: Entity ${entity} is not a light. Only light entities are supported by this tool.`;
      }

      if (!restConfig) {
        return "Error: Home Assistant configuration is required to control lights";
      }

      try {
        // Fetch entity state to get supported color modes and current state
        const entityState = await deps.getEntityStateImpl(restConfig.baseUrl, restConfig.accessToken || "", entity);
        if (!entityState) {
          return `Error: Light entity ${entity} not found in Home Assistant`;
        }

        const supportedColorModes = getSupportedColorModes(entityState);
        const currentBrightness = getCurrentBrightness(entityState);
        const isCurrentlyOn = entityState.state === 'on';

        // Prepare service call data
        let service = 'turn_on';
        const serviceData: Record<string, unknown> = { entity_id: entity };

        // Handle 'on' parameter
        if (on === true) {
          service = 'turn_on';
        } else if (on === false) {
          service = 'turn_off';
          // For turn_off, we don't need other parameters
          return await executeServiceCall(service, serviceData, deps, restConfig);
        } else if (on === null) {
          // Toggle behavior
          service = isCurrentlyOn ? 'turn_off' : 'turn_on';
          if (service === 'turn_off') {
            return await executeServiceCall(service, serviceData, deps, restConfig);
          }
        } else {
          // on is undefined - turn on if off, or adjust current settings if on
          if (!isCurrentlyOn) {
            service = 'turn_on';
          } else {
            service = 'turn_on'; // Adjust current settings
          }
        }

        // Handle brightness
        if (brightness_pct !== undefined && brightness_pct !== null) {
          // Convert percentage to 0-255 scale
          const brightness = Math.max(0, Math.min(255, Math.round((brightness_pct / 100) * 255)));
          serviceData['brightness'] = brightness;
        } else if (brightness_pct_delta !== undefined && brightness_pct_delta !== null && currentBrightness !== null) {
          // Apply delta to current brightness
          const delta = Math.round((brightness_pct_delta / 100) * 255);
          const newBrightness = Math.max(0, Math.min(255, currentBrightness + delta));
          serviceData['brightness'] = newBrightness;
        }

        // Handle color
        if (color !== undefined && color !== null) {
          if (supportedColorModes.length === 0) {
            return `Error: Light ${entity} does not support color control`;
          }

          const colorData = deps.convertColorImpl(color, supportedColorModes);
          if (!colorData) {
            const supportedModesStr = supportedColorModes.join(', ');
            return `Error: Cannot convert color to any supported format for light ${entity}. Supported modes: ${supportedModesStr}`;
          }

          // Merge color data into service data
          Object.assign(serviceData, colorData);
        }

        // Execute the service call
        return await executeServiceCall(service, serviceData, deps, restConfig);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error controlling light ${entity}: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Control Home Assistant lights with advanced features including brightness adjustment, color control, and automatic color format conversion.

Supports various color input formats that are automatically converted to the light's supported color modes:
- Color names: ${getExampleColorNames().join(', ')}, etc.
- RGB: {r: 255, g: 0, b: 0}
- XY (CIE 1931): {x: 0.675, y: 0.322}
- HS (Hue/Saturation): {h: 0, s: 100}
- RGBW: {r: 255, g: 0, b: 0, w: 0}
- Color temperature in Kelvin: 2700

The tool automatically detects the input format and converts it to the light's supported color modes (rgb, hs, xy, rgbw, color_temp_kelvin).

Brightness can be set as a percentage (brightness_pct) or adjusted by a percentage delta (brightness_pct_delta).
Use on=null to toggle the light, on=true to turn on, on=false to turn off.`,


      schema: z.object({
        entity: z.string().describe("The light entity_id to control (eg: 'light.bedroom_bulb', 'light.kitchen_uplights', 'light.study_bulb', etc.)"),
        on: z.union([
          z.boolean(),
          z.string()
        ]).nullable().optional().transform((val): boolean | null => {
          if (val === null || val === undefined) return null;
          if (typeof val === 'boolean') return val;
          const normalized = val.toLowerCase();
          if (normalized === 'true' || normalized === 'on') return true;
          if (normalized === 'false' || normalized === 'off') return false;
          throw new Error(`Invalid boolean value: ${val}`);
        }).describe("true/on=turn on, false/off=turn off, null=toggle (default: toggle if off, adjust if on)"),
        brightness_pct: z.number().nullable().optional().describe("Set brightness as percentage (0-100), null to leave unchanged"),
        brightness_pct_delta: z.number().nullable().optional().describe("Adjust brightness by percentage delta (+/- value), null to leave unchanged"),
        color: z.union([
          z.string().describe("Color name (e.g., 'red', 'blue', 'warm white')"),
          z.number().describe("Color temperature in Kelvin (e.g., 2700 for warm white)"),
          z.object({
            r: z.number().min(0).max(255),
            g: z.number().min(0).max(255),
            b: z.number().min(0).max(255)
          }).describe("RGB color values"),
          z.object({
            r: z.number().min(0).max(255),
            g: z.number().min(0).max(255),
            b: z.number().min(0).max(255),
            w: z.number().min(0).max(255)
          }).describe("RGBW color values (with white channel)"),
          z.object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1)
          }).describe("XY color coordinates (CIE 1931)"),
          z.object({
            h: z.number().min(0).max(360),
            s: z.number().min(0).max(100)
          }).describe("HS color (hue in degrees, saturation as percentage)")
        ]).nullable().optional().describe("Color to set (automatically converted to supported format), null to leave unchanged")
      })
    }
  );
}

/**
 * Execute a service call to Home Assistant
 */
async function executeServiceCall(
  service: string,
  serviceData: Record<string, unknown>,
  deps: ToggleLightDependencies,
  restConfig: HARestConfig
): Promise<string> {
  const domain = 'light';
  const entityId = serviceData['entity_id'] as string;

  // Priority logic: Prefer WebSocket API over tool calls
  if (restConfig && deps.callHAServiceWebSocketImpl) {
    try {
      await deps.callHAServiceWebSocketImpl(restConfig.baseUrl, restConfig.accessToken || "", domain, service, serviceData);
      return `Successfully executed ${domain}.${service} on light ${entityId}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to execute Home Assistant service via WebSocket: ${errorMessage}`);
    }
  } else {
    // Fallback: Record the service call for Home Assistant to process
    const haServiceCall: HomeAssistantServiceCall = {
      domain,
      service,
      service_data: serviceData as Record<string, unknown> & { entity_id: string | string[] }
    };

    await deps.recordServiceCallImpl(haServiceCall);
    return `Scheduled ${domain}.${service} execution on light ${entityId}`;
  }
}

/**
 * The toggle light tool instance factory
 */
export const toggleLightToolFactory: ToolFactory = async (context?: ToolContext) => {
  // Return mock tool for guests
  if (context?.userRole === 'guest') {
    const mockTool = createMockToggleLightTool();
    return { ok: true, tool: mockTool, name: mockTool.name };
  }

  const isValid = await verifyHomeAssistantConfigured();
  if (!isValid.ok) {
    return { ok: false, name: TOOL_NAME, reason: isValid.reason ?? "" };
  }
  const settings = await getSettings();
  const haConfig = settings.services?.homeAssistant;
  // Cast to HARestConfig after verification confirms baseUrl exists
  const tool = createToggleLightTool(haConfig as HARestConfig | undefined);
  return { ok: true, tool: tool, name: tool.name };
};
