import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { AgentContext } from "../agentContext.js";
import type { MessagesAnnotation } from "@langchain/langgraph";
import type { ToolCall } from "@langchain/core/messages/tool";
import { SystemMessage } from "@langchain/core/messages";
import { getModelConfig } from "../llm/modelBuilder.js";
import { getSettings } from "@/lib/config/settingsCache.js";
import type { Logger } from "pino";

/**
 * Configuration for retry behavior
 */
interface RetryConfig {
  maxRetries: number;
  backoffFactor: number;
  initialDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffFactor: 2.0,
  initialDelayMs: 1000,
};

/**
 * Log using pino's structured logging
 */
function logInfo(logger: Logger | undefined, obj: Record<string, unknown>, msg: string): void {
  if (logger) {
    logger.info(obj, msg);
  }
}

function logWarn(logger: Logger | undefined, obj: Record<string, unknown>, msg: string): void {
  if (logger) {
    logger.warn(obj, msg);
  }
}

function logDebug(logger: Logger | undefined, obj: Record<string, unknown>, msg: string): void {
  if (logger) {
    logger.debug(obj, msg);
  }
}

/**
 * Invoke model with retry logic
 */
async function invokeWithRetry<T>(
  invokeFn: () => Promise<T>,
  context: AgentContext,
  agentName: string,
  retryConfig: RetryConfig
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attemptNum = 1; attemptNum <= retryConfig.maxRetries; attemptNum++) {
    try {
      return await invokeFn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      
      logWarn(context.logger, {
        agent: agentName,
        attempt: attemptNum,
        maxRetries: retryConfig.maxRetries,
        error: lastError.message,
      }, `Model invocation failed (attempt ${attemptNum}/${retryConfig.maxRetries})`);
      
      if (attemptNum < retryConfig.maxRetries) {
        const delay = retryConfig.initialDelayMs * Math.pow(retryConfig.backoffFactor, attemptNum - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // This should never happen since we throw in the loop
  throw new Error(lastError?.message ?? "Unknown error");
}

/**
 * Invoke model with middleware for retry, logging, and tracing.
 */
export async function invokeModelWithMiddleware(
  state: typeof MessagesAnnotation.State,
  context: AgentContext,
  options: {
    modelKey: "router" | "response";
    systemPrompt: string;
    tools?: StructuredToolInterface[];
    threadId: string;
  }
): Promise<BaseMessage> {
  const { modelKey, systemPrompt, tools, threadId } = options;
  
  const settings = await getSettings();
  const modelConfig = await getModelConfig(
    modelKey === "router" ? settings.models.router : settings.models.response,
    []
  );

  // Convert messages to BaseMessage array
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...state.messages,
  ];

  // Log the model invocation
  logInfo(context.logger, {
    agent: modelKey,
    model: modelConfig.name ?? "unknown",
    messageCount: messages.length,
    hasTools: tools && tools.length > 0,
    threadId,
  }, `Invoking ${modelKey} model`);

  // Notify tracer of LLM call start
  context.tracer?.llmCallStart({
    id: crypto.randomUUID(),
    threadId,
    model: modelConfig.name ?? "unknown",
    agent: modelKey,
    messages,
    tools: tools as unknown as Array<{ name: string }>,
  });

  const startTime = Date.now();

  try {
    let result: BaseMessage;
    
    if (tools && tools.length > 0) {
      // Router model with tools
      const modelWithTools = (modelConfig as unknown as {
        bindTools(tools: StructuredToolInterface[]): { invoke(input: BaseMessage[]): Promise<BaseMessage> };
      }).bindTools(tools);

      result = await invokeWithRetry(
        () => modelWithTools.invoke(messages),
        context,
        modelKey,
        DEFAULT_RETRY_CONFIG
      );
    } else {
      // Response model without tools - cast to ensure BaseMessage return type
      const invokeResult = await invokeWithRetry<BaseMessage>(
        () => modelConfig.invoke(messages),
        context,
        modelKey,
        DEFAULT_RETRY_CONFIG
      );
      result = invokeResult;
    }

    const duration = Date.now() - startTime;

    // Notify tracer of LLM call complete
    context.tracer?.llmCallComplete({
      id: crypto.randomUUID(),
      threadId,
      model: modelConfig.name ?? "unknown",
      agent: modelKey,
      content: result.content,
      duration,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Notify tracer of LLM call error
    context.tracer?.llmCallError({
      id: crypto.randomUUID(),
      threadId,
      model: modelConfig.name ?? "unknown",
      agent: modelKey,
      error: errorMsg,
      duration,
    });

    throw error;
  }
}

/**
 * Tool execution result type - id is optional
 */
interface ToolResult {
  id?: string | undefined;
  output?: string | undefined;
  error?: string | undefined;
}

/**
 * Execute tools with retry and limit middleware.
 */
export async function executeToolsWithMiddleware(
  tools: StructuredToolInterface[],
  toolCalls: ToolCall[],
  context: AgentContext,
  threadId: string,
  options: {
    maxRetries?: number;
    maxCalls?: number;
  } = {}
): Promise<{ results: ToolResult[]; hitLimit: boolean }> {
  const { maxRetries = 3, maxCalls = 10 } = options;

  const results: ToolResult[] = [];
  let hitLimit = false;
  let totalCalls = 0;

  for (const toolCall of toolCalls) {
    if (totalCalls >= maxCalls) {
      hitLimit = true;
      results.push({
        id: toolCall.id,
        error: `Tool call limit reached (${maxCalls} calls). Stopping execution.`,
      });
      continue;
    }

    const tool = tools.find((t) => t.name === toolCall.name);
    if (!tool) {
      results.push({
        id: toolCall.id,
        error: `Tool not found: ${toolCall.name}`,
      });
      continue;
    }

    // Parse arguments - ToolCall has 'args' not 'arguments'
    let args: Record<string, unknown>;
    try {
      const argValue = toolCall.args;
      if (typeof argValue === "string") {
        args = JSON.parse(argValue) as Record<string, unknown>;
      } else {
        args = argValue as Record<string, unknown>;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      results.push({
        id: toolCall.id,
        error: `Invalid arguments: ${errorMsg}`,
      });
      continue;
    }

    // Execute with retry logic
    let output: string | undefined;
    let error: string | undefined;
    let success = false;
    let attempts = 0;

    while (attempts < maxRetries && !success) {
      attempts++;
      totalCalls++;

      logDebug(context.logger, {
        agent: "tools",
        tool: String(toolCall.name),
        attempt: attempts,
        threadId,
      }, `Executing tool: ${toolCall.name}`);

      // Notify tracer of tool call start
      context.tracer?.toolCallStart({
        id: toolCall.id ?? crypto.randomUUID(),
        threadId,
        name: toolCall.name,
        arguments: args,
      });

      const startTime = Date.now();

      try {
        const result: unknown = await tool.invoke(args);
        output = typeof result === "string" ? result : JSON.stringify(result);
        success = true;

        const duration = Date.now() - startTime;

        logDebug(context.logger, {
          agent: "tools",
          tool: toolCall.name,
          attempt: attempts,
          threadId,
        }, `Tool completed: ${toolCall.name}`);

        // Notify tracer of tool call complete
        context.tracer?.toolCallComplete({
          id: toolCall.id ?? crypto.randomUUID(),
          threadId,
          name: toolCall.name,
          result: output,
          duration,
        });
      } catch (e) {
        const duration = Date.now() - startTime;
        const errorMsg = e instanceof Error ? e.message : String(e);
        
        logWarn(context.logger, {
          agent: "tools",
          tool: toolCall.name,
          attempt: attempts,
          error: errorMsg,
          threadId,
        }, `Tool failed: ${toolCall.name}`);

        // Notify tracer of tool call error
        context.tracer?.toolCallError({
          id: toolCall.id ?? crypto.randomUUID(),
          threadId,
          name: toolCall.name,
          error: errorMsg,
          duration,
        });

        if (attempts >= maxRetries) {
          error = `Failed after ${maxRetries} attempts: ${errorMsg}`;
        } else {
          const delay = 1000 * Math.pow(2, attempts - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    results.push({
      id: toolCall.id,
      output,
      error,
    });
  }

  return { results, hitLimit };
}

/**
 * Build the router system prompt
 */
export function buildRouterSystemPrompt(now: Date, toolNames: string[]): string {
  const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

  return `You are a Tool Executor. Your job is to choose and call the appropriate tool(s) for the user's query. You are not allowed to chat.

Current time: ${timeStr}

Available tools: ${toolNames.join(", ")}

Instructions:
1. Analyze the user's query to determine what information is needed and/or what actions are needed to be taken.
2. Use available tools to gather required data and/or perform the requested actions.
3. When you have sufficient information and/or have performed all requested actions, respond with no tool calls.
4. Do not generate response text - only gather data and/or perform actions.

Call tools as needed, then respond with no tool calls when you are done.`;
}

/**
 * Build the response system prompt
 */
export function buildResponseSystemPrompt(now: Date): string {
  const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

  return `You are Bernard, a helpful family voice assistant. Your job is to provide helpful, natural responses to user queries.

Current time: ${timeStr}

Instructions:
1. Use the gathered information to provide a helpful response
2. Be conversational and natural in your tone, do NOT include emojis or special characters, your response will be read aloud by TTS.
3. Reference tool results when relevant to the user's query
4. Keep responses focused and to the point

Provide a natural, helpful response to the user.`;
}
