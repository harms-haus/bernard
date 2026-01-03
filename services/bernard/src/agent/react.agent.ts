import type { MessagesAnnotation } from "@langchain/langgraph";
import { createAgent, modelRetryMiddleware, toolCallLimitMiddleware, toolRetryMiddleware } from "langchain";
import type { ReactAgent } from "langchain";
import { createLoggingMiddleware, createTracingMiddleware } from "./middleware";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { getModelConfig } from "./llm";
import type { AgentContext } from "./agentContext";
import { getSettings } from "@/lib/config";

export async function reactAgent(
  state: typeof MessagesAnnotation.State,
  config: { configurable?: { thread_id?: string } },
  context: AgentContext
): Promise<ReactAgent> {
  const { tools, disabledTools } = context;

  const settings = await getSettings();
  const modelConfig = await getModelConfig(settings.models.router);

  return createAgent({
    model: modelConfig,
    systemPrompt: buildReactSystemPrompt(new Date(), tools.map((tool) => tool.name as string), disabledTools),
    tools: tools,
    middleware: getMiddleware(state, config, context, modelConfig),
  });
}

const getMiddleware = (state: typeof MessagesAnnotation.State, config: { configurable?: { thread_id?: string } }, context: AgentContext, modelConfig: LanguageModelLike) => {
  return [
    modelRetryMiddleware({
      maxRetries: 3,
      backoffFactor: 2.0,
      initialDelayMs: 1000,
    }),
    toolRetryMiddleware({
      maxRetries: 3,
      backoffFactor: 2.0,
      initialDelayMs: 1000,
    }),
    toolCallLimitMiddleware({
      runLimit: 10,
      exitBehavior: "error",
    }),
    createLoggingMiddleware({
      logger: context.logger,
      agent: "routing",
      model: modelConfig.name ?? "",
      tools: context.tools,
      conversationId: config.configurable?.thread_id,
    }),
    createTracingMiddleware({
      tracer: context.tracer,
      agent: "routing",
      model: modelConfig.name ?? "",
      tools: context.tools,
      conversationId: config.configurable?.thread_id,
    }),
  ];
}

/**
 * Router system prompt builder
 */
function buildReactSystemPrompt(
  now: Date,
  _toolNames: string[],
  disabledTools?: Array<{ name: string; reason?: string | undefined }>
): string {
  // Use TZ-aware formatting (respects TZ environment variable)
  const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

  let prompt = `You are a Tool Executor. Your job is to choose and call the appropriate tool(s) for the user's query. You are not allowed to chat.

Current time: ${timeStr}

Instructions:
1. Analyze the user's query to determine what information is needed and/or what actions are needed to be taken.
2. Use available tools to gather required data and/or perform the requested actions.
3. When you have sufficient information and/or have performed all requested actions, respond with no tool calls.
4. Do not generate response text - only gather data and/or perform actions.

Call tools as needed, then respond with no tool calls when you are done.`;

  // Include disabled tools with reasons if any exist
  if (disabledTools && disabledTools.length > 0) {
    const disabledList = disabledTools
      .map((t) => `  - ${t.name}: ${t.reason || "reason not specified"}`)
      .join("\n");
    prompt += `

## Disabled Tools

The following tools are currently unavailable. If the user asks for these, inform them why:

${disabledList}`;
  }

  return prompt;
}