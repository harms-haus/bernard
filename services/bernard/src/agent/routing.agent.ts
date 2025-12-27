import type { BernardStateType } from "./graph/state";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LLMCaller } from "@/agent/llm/llm";
import { buildRouterSystemPrompt } from "@/agent/harness/router/prompts";
import type { ToolWithInterpretation } from "@/agent/tool";

/**
 * Context for routing agent
 */
export type RoutingAgentContext = {
  llmCaller: LLMCaller;
  tools: StructuredToolInterface[];
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
  const { llmCaller, tools } = context;

  // Build system prompt for router
  const now = new Date();
  const toolPrompts = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    schema: tool.schema
  }));

  const systemPrompt = buildRouterSystemPrompt(now, toolPrompts);

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
  const aiMessage = await llmCaller.completeWithTools(
    messages,
    llmConfig,
    tools
  );

  // Update status based on whether tools were called
  const hasToolCalls = aiMessage.tool_calls && aiMessage.tool_calls.length > 0;
  const status = hasToolCalls ? "gathering_data" : "data_gathered";

  return {
    messages: [aiMessage],
    status
  };
}
