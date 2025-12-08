import { buildGraph as buildGraphImpl, __runnerTestHooks, instrumentTools, type AgentContext, type GraphDeps } from "./agentRunner";
import {
  collectToolCalls,
  contentFromMessage,
  extractMessagesFromChunk,
  extractTokenUsage,
  extractUsageFromMessages,
  findLastAssistantMessage,
  isRecord,
  isToolMessage,
  mapOpenAIToMessages,
  parseToolInput,
  safeStringify,
  summarizeToolOutputs,
  toOpenAIChatMessage,
  VALID_ROLES,
  type LangGraphToolCall,
  type OpenAIMessage,
  type TokenUsage
} from "./messages";
import { hasToolCall } from "./tools/toolCalls";

export type { AgentContext, GraphDeps };
export type { OpenAIMessage, TokenUsage, LangGraphToolCall };

export {
  collectToolCalls,
  contentFromMessage,
  extractMessagesFromChunk,
  extractTokenUsage,
  extractUsageFromMessages,
  findLastAssistantMessage,
  isRecord,
  isToolMessage,
  mapOpenAIToMessages,
  parseToolInput,
  safeStringify,
  summarizeToolOutputs,
  toOpenAIChatMessage,
  VALID_ROLES
};

export function buildGraph(ctx: AgentContext, deps: GraphDeps = {}) {
  return buildGraphImpl(ctx, deps);
}

export const __agentTestHooks = {
  classifyError: __runnerTestHooks.classifyError,
  hasToolCall,
  extractTokenUsage,
  instrumentTools
};
