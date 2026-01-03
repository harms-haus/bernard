import type { BernardStateType } from "./graph/state";
import { createAgent, modelRetryMiddleware } from "langchain";
import type { ReactAgent } from "langchain";
import { createLoggingMiddleware, createTracingMiddleware } from "./middleware";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { getModelConfig } from "./llm";
import type { AgentContext } from "./agentContext";
import type { ToolWithInterpretation } from "./tool";
import { getSettings } from "@/lib/config";

export async function responseAgent(
  state: BernardStateType,
  config: { configurable?: { thread_id?: string } },
  context: AgentContext
): Promise<ReactAgent> {
  const { disabledTools } = context;

  const settings = await getSettings();
  const modelConfig = await getModelConfig(settings.models.router);

  return createAgent({
    model: modelConfig,
    systemPrompt: buildResponseSystemPrompt(new Date(), disabledTools),
    tools: [],
    middleware: getMiddleware(state, config, context, modelConfig)
  });
}

const getMiddleware = (state: BernardStateType, config: { configurable?: { thread_id?: string } }, context: AgentContext, modelConfig: LanguageModelLike) => {
  return [
    modelRetryMiddleware({
      maxRetries: 3,
      backoffFactor: 2.0,
      initialDelayMs: 1000,
    }),
    createLoggingMiddleware({
      logger: context.logger,
      agent: "response",
      model: modelConfig.name ?? "",
      tools: [],
      conversationId: config.configurable?.thread_id,
    }),
    createTracingMiddleware({
      tracer: context.tracer,
      agent: "response",
      model: modelConfig.name ?? "",
      tools: [],
      conversationId: config.configurable?.thread_id,
    }),
  ];
}

/**
 * Response system prompt builder
 */
export function buildResponseSystemPrompt(
  now: Date,
  _availableTools?: Array<{ name: string; description?: string }>,
  _disabledTools?: Array<{ name: string; reason?: string }>,
  _toolDefinitions?: ToolWithInterpretation[],
  _usedTools?: string[],
  _reason?: string
): string {
  // Use TZ-aware formatting (respects TZ environment variable)
  const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

  const prompt = `You are Bernard, a helpful family voice assistant. Your job is to provide helpful, natural responses to user queries.

Current time: ${timeStr}

Instructions:
1. Use the gathered information to provide a helpful response
2. Be conversational and natural in your tone, do NOT include emojis or special characters, your response will be read aloud by TTS.
3. Reference tool results when relevant to the user's query
4. Keep responses focused and to the point

Provide a natural, helpful response to the user.`;

  return prompt;
}