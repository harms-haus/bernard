import type { BernardStateType } from "./graph/state";
import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMCaller } from "@/agent/llm/llm";
import { buildResponseSystemPrompt } from "./prompts/response";
import type { ToolWithInterpretation } from "@/agent/tool";

/**
 * Callback for streaming response tokens
 */
export type ResponseStreamCallback = (chunk: string) => void;

/**
 * Context for response agent
 */
export type ResponseAgentContext = {
  llmCaller: LLMCaller;
  toolDefinitions?: ToolWithInterpretation[];
  disabledTools?: Array<{ name: string; reason: string }>;
  usedTools?: string[];
  streamCallback?: ResponseStreamCallback;
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
  const { llmCaller, toolDefinitions, disabledTools, usedTools = [], streamCallback } = context;

  // Build response system prompt
  const systemPrompt = buildResponseSystemPrompt(
    new Date(),
    undefined, // availableTools
    disabledTools,
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

  let responseText = "";

  // Use streaming if callback is provided
  if (streamCallback) {
    for await (const chunk of llmCaller.streamText(messages, llmConfig)) {
      responseText += chunk;
      streamCallback(chunk);
    }
  } else {
    // Fallback to non-streaming
    const response = await llmCaller.complete(messages, llmConfig);
    responseText = response.content;
  }

  // Create AIMessage from response
  const { AIMessage } = await import("@langchain/core/messages");
  const aiMessage = new AIMessage(responseText);

  return {
    messages: [aiMessage],
    status: "complete"
  };
}
