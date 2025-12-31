import type { BernardStateType } from "./graph/state";
import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LLMCaller } from "@/agent/llm/llm";
import { buildRouterSystemPrompt } from "./prompts/router";
import pino from "pino";

const logger = pino({ base: { service: "bernard" } });

/**
 * Context for routing agent
 */
export type RoutingAgentContext = {
  llmCaller: LLMCaller;
  tools: StructuredToolInterface[];
  disabledTools?: Array<{ name: string; reason: string }>;
  haContextManager?: unknown;
  haRestConfig?: unknown;
  plexConfig?: unknown;
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  };
};

/**
 * Router Agent Node - Data Coordinator
 * 
 * This node prompts the LLM to act as a "Data Coordinator" that only gathers data.
 * It outputs tool calls if more information is needed, or a simple "DATA_GATHERED" message
 * if it has enough data.
 */
export async function routingAgentNode(
  state: BernardStateType,
  config: { configurable?: { thread_id?: string } },
  context: RoutingAgentContext
): Promise<Partial<BernardStateType>> {
  const { llmCaller, tools, disabledTools } = context;

  // Build system prompt for router
  const now = new Date();
  const toolNames = tools.map((tool) => tool.name);

  const systemPrompt = buildRouterSystemPrompt(now, toolNames, disabledTools);

  // Prepare messages with system prompt
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...state.messages
  ];

  // Get router model config from settings
  const { getSettings } = await import("@/lib/config/settingsCache");
  const settings = await getSettings();
  const routerConfig = settings.models.router;

  // Call LLM with tools bound
  const llmConfig: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  } = {
    model: routerConfig.primary,
  };
  if (routerConfig.options?.temperature !== undefined) {
    llmConfig.temperature = routerConfig.options.temperature;
  }
  if (routerConfig.options?.maxTokens !== undefined) {
    llmConfig.maxTokens = routerConfig.options.maxTokens;
  }

  logger.debug({ model: llmConfig.model, toolsCount: tools.length }, "Calling LLM");

  const aiMessage = await llmCaller.completeWithTools(
    messages,
    llmConfig,
    tools
  );

  logger.debug({ toolCallsCount: aiMessage.tool_calls?.length ?? 0 }, "LLM response received");

  // Update status based on whether tools were called
  const hasToolCalls = aiMessage.tool_calls && aiMessage.tool_calls.length > 0;
  const status = hasToolCalls ? "gathering_data" : "data_gathered";

  // Router should only output tool calls, not text content
  aiMessage.content = "";

  return {
    messages: [aiMessage],
    status
  };
}
