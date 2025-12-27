import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  parseHomeAssistantEntities,
  extractHomeAssistantContext,
  findEntity,
  validateEntityId,
  getDomainFromEntityId,
  formatEntitiesForDisplay
} from "../agent/tool/ha-entities";
import { createListHAEntitiesToolInstance } from "../agent/tool/ha-list-entities";
import { createExecuteHomeAssistantServicesToolInstance } from "../agent/tool/ha-execute-services";
import { createGetHistoricalStateToolInstance } from "../agent/tool/ha-historical-state";
import { HomeAssistantContextManager } from "../agent/tool/ha-context";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

describe("Home Assistant Entities", () => {
  describe("parseHomeAssistantEntities", () => {
    it("should parse entities from CSV format", () => {
      const systemPrompt = `
Some other text
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light/lamp
switch.kitchen,Kitchen Switch,off,light switch
sensor.temperature,Temperature Sensor,22.5,thermometer
\`\`\`
More text
      `;

      const entities = parseHomeAssistantEntities(systemPrompt);

      expect(entities).toHaveLength(3);
      expect(entities[0]).toEqual({
        entity_id: "light.living_room",
        name: "Living Room Light",
        state: "on",
        aliases: ["main light", "lamp"]
      });
      expect(entities[1]).toEqual({
        entity_id: "switch.kitchen",
        name: "Kitchen Switch",
        state: "off",
        aliases: ["light switch"]
      });
      expect(entities[2]).toEqual({
        entity_id: "sensor.temperature",
        name: "Temperature Sensor",
        state: "22.5",
        aliases: ["thermometer"]
      });
    });

    it("should return empty array when no CSV found", () => {
      const systemPrompt = "No entities here";
      const entities = parseHomeAssistantEntities(systemPrompt);
      expect(entities).toHaveLength(0);
    });

    it("should handle malformed CSV lines", () => {
      const systemPrompt = `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on
switch.kitchen,Kitchen Switch,off,light switch
\`\`\`
      `;

      const entities = parseHomeAssistantEntities(systemPrompt);
      expect(entities).toHaveLength(1); // Only the line with 4 fields is valid
      expect(entities[0].entity_id).toBe("switch.kitchen");
      expect(entities[0].aliases).toEqual(["light switch"]);
    });
  });

  describe("extractHomeAssistantContext", () => {
    it("should extract context from system messages", () => {
      const messages = [
        new SystemMessage({
          content: `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
\`\`\`
          `
        }),
        new HumanMessage({ content: "Hello" })
      ];

      const context = extractHomeAssistantContext(messages);
      expect(context).toBeTruthy();
      expect(context?.entities).toHaveLength(1);
      expect(context?.entities[0].entity_id).toBe("light.living_room");
    });

    it("should return null when no system messages contain entities", () => {
      const messages = [
        new HumanMessage({ content: "Hello" }),
        new AIMessage({ content: "Hi" })
      ];

      const context = extractHomeAssistantContext(messages);
      expect(context).toBeNull();
    });
  });

  describe("findEntity", () => {
    const entities = [
      { entity_id: "light.living_room", name: "Living Room Light", state: "on", aliases: ["main light"] },
      { entity_id: "switch.kitchen", name: "Kitchen Switch", state: "off", aliases: ["light switch"] }
    ];

    it("should find entity by entity_id", () => {
      const entity = findEntity(entities, "light.living_room");
      expect(entity).toEqual(entities[0]);
    });

    it("should find entity by alias", () => {
      const entity = findEntity(entities, "main light");
      expect(entity).toEqual(entities[0]);
    });

    it("should be case insensitive", () => {
      const entity = findEntity(entities, "LIGHT.LIVING_ROOM");
      expect(entity).toEqual(entities[0]);
    });

    it("should return undefined when not found", () => {
      const entity = findEntity(entities, "nonexistent");
      expect(entity).toBeUndefined();
    });
  });

  describe("validateEntityId", () => {
    it("should validate correct entity IDs", () => {
      expect(validateEntityId("light.living_room")).toBe(true);
      expect(validateEntityId("switch.kitchen")).toBe(true);
      expect(validateEntityId("sensor.temperature")).toBe(true);
    });

    it("should reject invalid entity IDs", () => {
      expect(validateEntityId("living_room")).toBe(false);
      expect(validateEntityId("light-")).toBe(false);
      expect(validateEntityId("light")).toBe(false);
      expect(validateEntityId("")).toBe(false);
    });
  });

  describe("getDomainFromEntityId", () => {
    it("should extract domain from entity ID", () => {
      expect(getDomainFromEntityId("light.living_room")).toBe("light");
      expect(getDomainFromEntityId("switch.kitchen")).toBe("switch");
      expect(getDomainFromEntityId("sensor.temperature")).toBe("sensor");
    });

    it("should return null for invalid entity IDs", () => {
      expect(getDomainFromEntityId("living_room")).toBeNull();
      expect(getDomainFromEntityId("light")).toBeNull();
      expect(getDomainFromEntityId("")).toBeNull();
    });
  });

  describe("formatEntitiesForDisplay", () => {
    it("should format entities for display", () => {
      const entities = [
        { entity_id: "light.living_room", name: "Living Room Light", state: "on", aliases: ["main light"] },
        { entity_id: "switch.kitchen", name: "Kitchen Switch", state: "off", aliases: [] }
      ];

      const formatted = formatEntitiesForDisplay(entities);
      expect(formatted).toContain("Available Home Assistant entities:");
      expect(formatted).toContain("light.living_room: Living Room Light (state: on) (aliases: main light)");
      expect(formatted).toContain("switch.kitchen: Kitchen Switch (state: off)");
    });

    it("should handle entities with no aliases", () => {
      const entities = [
        { entity_id: "light.living_room", name: "Living Room Light", state: "on", aliases: [] }
      ];

      const formatted = formatEntitiesForDisplay(entities);
      expect(formatted).toContain("light.living_room: Living Room Light (state: on)");
      expect(formatted).not.toContain("aliases:");
    });

    it("should handle empty entity list", () => {
      const formatted = formatEntitiesForDisplay([]);
      expect(formatted).toBe("No Home Assistant entities available.");
    });
  });
});

// Mock the WebSocket client
vi.mock("../agent/tool/ha-websocket-client", () => ({
  getHAConnection: vi.fn(),
  closeHAConnection: vi.fn(),
  closeAllHAConnections: vi.fn(),
  getHAConnectionStats: vi.fn()
}));

// Mock the home-assistant-js-websocket library
vi.mock("home-assistant-js-websocket", () => ({
  getStates: vi.fn(),
  callService: vi.fn(),
  createLongLivedTokenAuth: vi.fn(),
  createConnection: vi.fn()
}));

describe("Home Assistant Tools", () => {
  let scopedContextManager: HomeAssistantContextManager;

  beforeEach(() => {
    scopedContextManager = new HomeAssistantContextManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("listHAServicesTool", () => {
    it("should list available entities", async () => {
      // Set up context
      scopedContextManager.updateFromMessages([
        new SystemMessage({
          content: `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
switch.kitchen,Kitchen Switch,off,light switch
\`\`\`
          `
        })
      ]);

      const tool = createListHAEntitiesToolInstance(scopedContextManager);
      const result = await tool.invoke({});

      expect(result).toContain("Available Home Assistant entities:");
      expect(result).toContain("light.living_room");
      expect(result).toContain("switch.kitchen");
    });

    it("should handle no entities available", async () => {
      const tool = createListHAEntitiesToolInstance(scopedContextManager);
      const result = await tool.invoke({});

      expect(result).toBe("No Home Assistant entities are currently available. Please ensure the system prompt contains Home Assistant entity information or configure Home Assistant WebSocket API settings.");
    });
  });

  describe("executeServicesTool", () => {
    it("should execute a service call via WebSocket API when configured", async () => {
      // Mock WebSocket connection and callService
      const mockConnection = { connected: true };
      const { getHAConnection } = await import("../agent/tool/ha-websocket-client");
      const { callService } = await import("home-assistant-js-websocket");

      vi.mocked(getHAConnection).mockResolvedValue(mockConnection as any);
      vi.mocked(callService).mockResolvedValue(undefined);

      const haRestConfig = {
        baseUrl: "http://localhost:8123",
        accessToken: "test-token"
      };

      const tool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager, haRestConfig);
      const result = await tool.invoke({
        list: [
          {
            domain: "light",
            service: "turn_on",
            service_data: {
              entity_id: "light.living_room"
            }
          }
        ]
      });

      expect(result).toContain("Service light.turn_on executed successfully");
      expect(result).toContain("light.living_room");
      expect(callService).toHaveBeenCalledWith(
        mockConnection,
        "light",
        "turn_on",
        { entity_id: "light.living_room" }
      );
    });

    it("should fallback to recording service calls when WebSocket not configured", async () => {
      // Set up context with entities
      scopedContextManager.updateFromMessages([
        new SystemMessage({
          content: `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
\`\`\`
          `
        })
      ]);

      const tool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager);
      const result = await tool.invoke({
        list: [
          {
            domain: "light",
            service: "turn_on",
            service_data: {
              entity_id: "light.living_room"
            }
          }
        ]
      });

      expect(result).toContain("Service light.turn_on scheduled for execution");
      expect(result).toContain("light.living_room");

      // Verify service call was recorded
      const recordedCalls = scopedContextManager.getRecordedServiceCalls();
      expect(recordedCalls).toHaveLength(1);
      expect(recordedCalls[0]).toEqual({
        domain: "light",
        service: "turn_on",
        service_data: {
          entity_id: "light.living_room"
        }
      });
    });

    it("should validate entity ID format", async () => {
      const tool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager);
      
      await expect(
        tool.invoke({
          list: [
            {
              domain: "light",
              service: "turn_on",
              service_data: {
                entity_id: "invalid_entity"
              }
            }
          ]
        })
      ).rejects.toThrow("Invalid entity_id format");
    });

    it("should validate domain match", async () => {
      const tool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager);
      
      await expect(
        tool.invoke({
          list: [
            {
              domain: "light",
              service: "turn_on",
              service_data: {
                entity_id: "switch.kitchen"
              }
            }
          ]
        })
      ).rejects.toThrow("does not match domain");
    });

    it("should handle multiple service calls", async () => {
      // Set up context with entities
      scopedContextManager.updateFromMessages([
        new SystemMessage({
          content: `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
switch.kitchen,Kitchen Switch,off,light switch
\`\`\`
          `
        })
      ]);

      const tool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager);
      const result = await tool.invoke({
        list: [
          {
            domain: "light",
            service: "turn_on",
            service_data: {
              entity_id: "light.living_room"
            }
          },
          {
            domain: "switch",
            service: "turn_off",
            service_data: {
              entity_id: "switch.kitchen"
            }
          }
        ]
      });

      expect(result).toContain("Service light.turn_on scheduled");
      expect(result).toContain("Service switch.turn_off scheduled");
    });

    it("should handle array of entity IDs", async () => {
      // Set up context with entities
      scopedContextManager.updateFromMessages([
        new SystemMessage({
          content: `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
light.kitchen,Kitchen Light,off,kitchen light
\`\`\`
          `
        })
      ]);

      const tool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager);
      const result = await tool.invoke({
        list: [
          {
            domain: "light",
            service: "turn_on",
            service_data: {
              entity_id: ["light.living_room", "light.kitchen"]
            }
          }
        ]
      });

      expect(result).toContain("light.living_room, light.kitchen");
    });
  });

  describe("Service Call Recording", () => {
    it("should record service calls in context manager", async () => {
      // Set up context with entities
      scopedContextManager.updateFromMessages([
        new SystemMessage({
          content: `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
\`\`\`
          `
        })
      ]);

      const tool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager);

      await tool.invoke({
        list: [
          {
            domain: "light",
            service: "turn_on",
            service_data: {
              entity_id: "light.living_room"
            }
          }
        ]
      });

      const recordedCalls = scopedContextManager.getRecordedServiceCalls();
      expect(recordedCalls).toHaveLength(1);
      expect(recordedCalls[0]).toEqual({
        domain: "light",
        service: "turn_on",
        service_data: {
          entity_id: "light.living_room"
        }
      });
    });

    it("should clear recorded calls", () => {
      scopedContextManager.recordServiceCall({
        domain: "light",
        service: "turn_on",
        service_data: {
          entity_id: "light.living_room"
        }
      });

      expect(scopedContextManager.getRecordedServiceCalls()).toHaveLength(1);
      
      scopedContextManager.clearServiceCalls();
      expect(scopedContextManager.getRecordedServiceCalls()).toHaveLength(0);
    });
  });

  describe("getHistoricalStateTool", () => {
    it("should fetch historical state data", async () => {
      // Mock WebSocket connection and sendMessagePromise
      const mockConnection = {
        connected: true,
        sendMessagePromise: vi.fn()
      };
      const { getHAConnection } = await import("../agent/tool/ha-websocket-client");

      vi.mocked(getHAConnection).mockResolvedValue(mockConnection as any);
      mockConnection.sendMessagePromise.mockResolvedValue({
        'sensor.temperature': [
          {
            entity_id: 'sensor.temperature',
            state: '22.5',
            attributes: { unit_of_measurement: '°C' },
            last_changed: '2024-01-01T12:00:00Z',
            last_updated: '2024-01-01T12:00:00Z'
          }
        ]
      });

      const haRestConfig = {
        baseUrl: "http://localhost:8123",
        accessToken: "test-token"
      };

      const tool = createGetHistoricalStateToolInstance(haRestConfig);
      const result = await tool.invoke({
        entity_ids: ["sensor.temperature"],
        start_time: "2024-01-01T00:00:00Z",
        end_time: "2024-01-02T00:00:00Z"
      });

      expect(result).toContain("Historical data for sensor.temperature");
      expect(result).toContain("22.5");
      expect(result).toContain("2024-01-01T12:00:00.000Z");
      expect(mockConnection.sendMessagePromise).toHaveBeenCalledWith({
        type: 'history/history_during_period',
        start_time: expect.any(String),
        end_time: expect.any(String),
        entity_ids: ["sensor.temperature"],
        include_start_time_state: true,
        significant_changes_only: false
      });
    });

    it("should handle no historical data", async () => {
      const mockConnection = {
        connected: true,
        sendMessagePromise: vi.fn()
      };
      const { getHAConnection } = await import("../agent/tool/ha-websocket-client");

      vi.mocked(getHAConnection).mockResolvedValue(mockConnection as any);
      mockConnection.sendMessagePromise.mockResolvedValue({
        'sensor.temperature': []
      });

      const haRestConfig = {
        baseUrl: "http://localhost:8123",
        accessToken: "test-token"
      };

      const tool = createGetHistoricalStateToolInstance(haRestConfig);
      const result = await tool.invoke({
        entity_ids: ["sensor.temperature"],
        start_time: "2024-01-01T00:00:00Z",
        end_time: "2024-01-02T00:00:00Z"
      });

      expect(result).toContain("Historical data for sensor.temperature");
      expect(result).toContain("No state changes found in the specified time range");
    });

    it("should require WebSocket configuration", async () => {
      const tool = createGetHistoricalStateToolInstance();
      const result = await tool.invoke({
        entity_ids: ["sensor.temperature"],
        start_time: "2024-01-01T00:00:00Z",
        end_time: "2024-01-02T00:00:00Z"
      });

      expect(result).toContain("Home Assistant WebSocket configuration is required");
    });
  });
});