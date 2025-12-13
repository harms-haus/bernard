import { describe, it, expect, beforeEach } from "vitest";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import { HomeAssistantContextManager } from "@/agent/harness/intent/tools/ha-context";
import { buildGraph } from "@/lib/agent";
import { buildIntentLLM, buildResponseLLM } from "@/app/api/v1/_lib/openai/modelBuilders";
import { resolveModel } from "@/lib/config/models";
import { createScaffolding } from "@/app/api/v1/_lib/openai";
import { getRedis } from "@/lib/infra/redis";
import { ConversationSummaryService } from "@/lib/conversation/summary";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";

describe("Home Assistant Integration End-to-End", () => {
  let graph: Awaited<ReturnType<typeof buildGraph>>;
  let keeper: RecordKeeper;
  let conversationId: string;
  let requestId: string;
  let turnId: string;
  let scopedContextManager: HomeAssistantContextManager;

  beforeEach(async () => {
    // Set up the agent graph
    const responseModelConfig = await resolveModel("response");
    const intentModelConfig = await resolveModel("intent", { fallback: [responseModelConfig.id] });
    
    const redis = getRedis();
    let summarizer: ConversationSummaryService | undefined;
    try {
      summarizer = await ConversationSummaryService.create();
    } catch {
      // summarizer is optional
    }
    keeper = new RecordKeeper(redis, summarizer ? { summarizer } : {});

    const scaffold = await keeper.startRequest("test-token", responseModelConfig.id);
    requestId = scaffold.requestId;
    conversationId = scaffold.conversationId;
    turnId = await keeper.startTurn(requestId, conversationId, "test-token", responseModelConfig.id);

    const intentLLM = buildIntentLLM(intentModelConfig, responseModelConfig);
    const responseLLM = buildResponseLLM(responseModelConfig, { });

    graph = await buildGraph(
      {
        recordKeeper: keeper,
        turnId,
        conversationId,
        requestId,
        token: "test-token",
        model: responseModelConfig.id,
        responseModel: responseModelConfig.id,
        intentModel: intentModelConfig.id
      },
      { responseModel: responseLLM, intentModel: intentLLM }
    );

    // Create a new scoped context manager for each test
    scopedContextManager = new HomeAssistantContextManager();
  });

  it("should parse Home Assistant entities from system prompt and execute service calls", async () => {
    const systemPrompt = new SystemMessage({
      content: `
You are Bernard, an AI assistant.

Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light/lamp
switch.kitchen,Kitchen Switch,off,light switch
sensor.temperature,Temperature Sensor,22.5,thermometer
\`\`\`

Please assist the user with controlling these devices.
      `
    });

    const userMessage = new HumanMessage({
      content: "Please turn off the living room light and turn on the kitchen switch."
    });

    const messages = [systemPrompt, userMessage];

    // Run the agent
    const result = await graph.invoke({ messages });

    // Check that service calls were recorded
    const recordedCalls = scopedContextManager.getRecordedServiceCalls();
    expect(recordedCalls.length).toBeGreaterThan(0);

    // Verify we have the expected service calls
    const turnOffLight = recordedCalls.find((call: any) =>
      call.domain === "light" &&
      call.service === "turn_off" &&
      call.service_data.entity_id === "light.living_room"
    );
    const turnOnSwitch = recordedCalls.find((call: any) =>
      call.domain === "switch" &&
      call.service === "turn_on" &&
      call.service_data.entity_id === "switch.kitchen"
    );

    expect(turnOffLight).toBeDefined();
    expect(turnOnSwitch).toBeDefined();

    // Check that the response contains tool calls
    const assistantMessage = result.messages?.find(m => (m as { _getType?: () => string })._getType?.() === "ai");
    expect(assistantMessage).toBeDefined();
  });

  it("should list available Home Assistant entities", async () => {
    const systemPrompt = new SystemMessage({
      content: `
You are Bernard, an AI assistant.

Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
switch.kitchen,Kitchen Switch,off,light switch
\`\`\`
      `
    });

    const userMessage = new HumanMessage({
      content: "What devices do you have available?"
    });

    const messages = [systemPrompt, userMessage];

    // Run the agent
    const result = await graph.invoke({ messages });

    // Check that the response mentions the entities
    const assistantMessage = result.messages?.find(m => (m as { _getType?: () => string })._getType?.() === "ai");
    const content = (assistantMessage as { content?: unknown }).content;
    expect(content).toBeDefined();
    
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    expect(contentStr.toLowerCase()).toContain("light.living_room");
    expect(contentStr.toLowerCase()).toContain("switch.kitchen");
  });

  it("should handle invalid entity IDs gracefully", async () => {
    const systemPrompt = new SystemMessage({
      content: `
You are Bernard, an AI assistant.

Available Devices:
\`\`\`csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light
\`\`\`
      `
    });

    const userMessage = new HumanMessage({
      content: "Turn on the invalid_entity device."
    });

    const messages = [systemPrompt, userMessage];

    // Run the agent - this should not throw but should handle the error
    const result = await graph.invoke({ messages });

    // Check that no invalid service calls were recorded
    const recordedCalls = scopedContextManager.getRecordedServiceCalls();
    const invalidCall = recordedCalls.find((call: any) =>
      call.service_data.entity_id === "invalid_entity"
    );
    expect(invalidCall).toBeUndefined();
  });
});