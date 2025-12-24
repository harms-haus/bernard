import { describe, it, expect, beforeEach } from "vitest";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  parseHomeAssistantEntities,
  extractHomeAssistantContext,
  formatEntitiesForDisplay
} from "../agent/tool/ha-entities";
import { HomeAssistantContextManager } from "../agent/tool/ha-context";
import { createListHAEntitiesToolInstance } from "../agent/tool/ha-list-entities";
import { createExecuteHomeAssistantServicesToolInstance } from "../agent/tool/ha-execute-services";

describe("Home Assistant Simple Integration", () => {
  let scopedContextManager: HomeAssistantContextManager;

  beforeEach(() => {
    scopedContextManager = new HomeAssistantContextManager();
  });

  it("should parse entities, list them, and execute services", async () => {
    // 1. Parse entities from system prompt
    const systemPrompt = `
You are Bernard, an AI assistant.

Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light/lamp
switch.kitchen,Kitchen Switch,off,light switch
sensor.temperature,Temperature Sensor,22.5,thermometer
\`\`\`

Please assist the user with controlling these devices.
    `;

    const entities = parseHomeAssistantEntities(systemPrompt);
    expect(entities).toHaveLength(3);
    expect(entities[0].entity_id).toBe("light.living_room");
    expect(entities[1].entity_id).toBe("switch.kitchen");
    expect(entities[2].entity_id).toBe("sensor.temperature");

    // 2. Extract context from messages
    const messages = [
      new SystemMessage({ content: systemPrompt }),
      new HumanMessage({ content: "Turn off the living room light." })
    ];

    const context = extractHomeAssistantContext(messages);
    expect(context).toBeDefined();
    expect(context?.entities).toHaveLength(3);

    // 3. Update context manager
    scopedContextManager.updateFromMessages(messages);
    expect(scopedContextManager.hasContext()).toBe(true);
    expect(scopedContextManager.getEntities()).toHaveLength(3);

    // 4. List services tool should work
    const listTool = createListHAEntitiesToolInstance(scopedContextManager);
    const listResult = await listTool.invoke({});
    expect(listResult).toContain("light.living_room");
    expect(listResult).toContain("switch.kitchen");
    expect(listResult).toContain("sensor.temperature");

    // 5. Execute services tool should work
    const executeTool = createExecuteHomeAssistantServicesToolInstance(scopedContextManager);
    const executeResult = await executeTool.invoke({
      list: [
        {
          domain: "light",
          service: "turn_off",
          service_data: {
            entity_id: "light.living_room"
          }
        },
        {
          domain: "switch",
          service: "turn_on",
          service_data: {
            entity_id: "switch.kitchen"
          }
        }
      ]
    });

    expect(executeResult).toContain("Service light.turn_off scheduled");
    expect(executeResult).toContain("Service switch.turn_on scheduled");
    expect(executeResult).toContain("light.living_room");
    expect(executeResult).toContain("switch.kitchen");

    // 6. Check that service calls were recorded
    const recordedCalls = scopedContextManager.getRecordedServiceCalls();
    expect(recordedCalls).toHaveLength(2);
    
    expect(recordedCalls[0]).toEqual({
      domain: "light",
      service: "turn_off",
      service_data: {
        entity_id: "light.living_room"
      }
    });
    
    expect(recordedCalls[1]).toEqual({
      domain: "switch",
      service: "turn_on",
      service_data: {
        entity_id: "switch.kitchen"
      }
    });
  });

  it("should handle entity lookup by alias", async () => {
    const systemPrompt = `
Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light/lamp
\`\`\`
    `;

    scopedContextManager.updateFromMessages([
      new SystemMessage({ content: systemPrompt })
    ]);

    // Test that we can find the entity by alias
    const entity = scopedContextManager.findEntity("main light");
    expect(entity).toBeDefined();
    expect(entity?.entity_id).toBe("light.living_room");

    // Test case insensitive
    const entity2 = scopedContextManager.findEntity("MAIN LIGHT");
    expect(entity2).toBeDefined();
    expect(entity2?.entity_id).toBe("light.living_room");
  });

  it("should validate entity IDs correctly", () => {
    expect(scopedContextManager.validateEntityId("light.living_room")).toBe(true);
    expect(scopedContextManager.validateEntityId("switch.kitchen")).toBe(true);
    expect(scopedContextManager.validateEntityId("sensor.temperature")).toBe(true);
    
    expect(scopedContextManager.validateEntityId("living_room")).toBe(false);
    expect(scopedContextManager.validateEntityId("light")).toBe(false);
    expect(scopedContextManager.validateEntityId("")).toBe(false);
  });

  it("should extract domain from entity IDs", () => {
    expect(scopedContextManager.getDomainFromEntityId("light.living_room")).toBe("light");
    expect(scopedContextManager.getDomainFromEntityId("switch.kitchen")).toBe("switch");
    expect(scopedContextManager.getDomainFromEntityId("sensor.temperature")).toBe("sensor");
    
    expect(scopedContextManager.getDomainFromEntityId("living_room")).toBeNull();
    expect(scopedContextManager.getDomainFromEntityId("light")).toBeNull();
  });

  it("should format entities for display correctly", () => {
    const entities = [
      { entity_id: "light.living_room", name: "Living Room Light", state: "on", aliases: ["main light", "lamp"] },
      { entity_id: "switch.kitchen", name: "Kitchen Switch", state: "off", aliases: [] }
    ];

    const formatted = formatEntitiesForDisplay(entities);
    expect(formatted).toContain("Available Home Assistant entities:");
    expect(formatted).toContain("light.living_room: Living Room Light (state: on) (aliases: main light, lamp)");
    expect(formatted).toContain("switch.kitchen: Kitchen Switch (state: off)");
  });
});