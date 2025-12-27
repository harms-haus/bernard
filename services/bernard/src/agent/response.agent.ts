import type { BernardStateType } from "./graph/state";
import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMCaller } from "@/agent/llm/llm";
import { buildResponseSystemPrompt } from "@/agent/harness/respond/prompts";
import type { ToolWithInterpretation } from "@/agent/tool";

/**
 * Context for response agent
 */
export type ResponseAgentContext = {
  llmCaller: LLMCaller;
  toolDefinitions?: ToolWithInterpretation[];
  usedTools?: string[];
};

/**
 * Response Agent Node - Creative Assistant
 * 
 * This node receives the full history (User query + all Tool results) and generates
 * the final creative response. It only runs when the router has gathered all necessary data.
 */
export async function responseAgentNode(
  state: BernardStateType,
  config: { configurable?: { thread_id?: string } },
  context: ResponseAgentContext
): Promise<Partial<BernardStateType>> {
  const { llmCaller, toolDefinitions, usedTools = [] } = context;

  // Build response system prompt
  const systemPrompt = buildResponseSystemPrompt(
    new Date(),
    undefined, // availableTools
    undefined, // disabledTools
    toolDefinitions,
    usedTools
  );

  // Prepare messages with system prompt
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...state.messages
  ];

  // Get response model config from settings
  const { getSettings } = await import("@/lib/config/settingsCache");
  const settings = await getSettings();
  const responseConfig = settings.models.response;

  // Call LLM for creative response (no tools)
  const llmConfig: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  } = {
    model: responseConfig.primary,
  };
  if (responseConfig.options?.temperature !== undefined) {
    llmConfig.temperature = responseConfig.options.temperature;
  }
  if (responseConfig.options?.maxTokens !== undefined) {
    llmConfig.maxTokens = responseConfig.options.maxTokens;
  }
  const response = await llmCaller.complete(
    messages,
    llmConfig
  );

  // Create AIMessage from response
  const { AIMessage } = await import("@langchain/core/messages");
  const aiMessage = new AIMessage(response.content);

  return {
    messages: [aiMessage],
    status: "complete"
  };
}
