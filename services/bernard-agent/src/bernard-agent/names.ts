/**
 * Thread Naming Utility
 * 
 * Provides automatic thread naming using the utility model.
 */
import { getRedis } from "@/lib/infra/redis";
import { resolveModel } from "@/lib/config/models";
import { initChatModel } from "langchain/chat_models/universal";
import { childLogger } from "@/lib/logging/logger";
import type { LogContext } from "@/lib/logging/logger";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { BernardStateAnnotation } from "./state";
import { HumanMessage } from "@langchain/core/messages";

export interface ThreadNamingJobInput {
  threadId: string;
  message: string;
}

export interface ThreadNamingResult {
  success: boolean;
  threadId: string;
  title: string;
}

/**
 * Generate a title for a thread based on the first user message
 */
export async function generateTitle(message: string): Promise<string> {
  const context: LogContext = {
    stage: "generateTitle",
  };
  const log = childLogger(context);
  
  try {
    // Resolve the utility model
    const { id: modelId, options } = await resolveModel("utility");
    
    // Initialize the model with low temperature for consistent output
    const llm = await initChatModel(modelId, {
      ...options,
      temperature: 0.3,
      maxTokens: 30,
    });
    
    // System prompt for title generation
    const systemPrompt = `You are a helpful assistant that generates short, concise thread titles.
Generate a title (3-6 words) that summarizes the user's message.
Do not use quotes or punctuation in the title.
Keep it simple and descriptive.
Example: "Weather forecast for Tokyo"`;
    
    // Generate the title
    const response = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate a title for this message: "${message}"` },
    ]);
    
    // Clean up the response
    const responseText = typeof response.content === "string" 
      ? response.content 
      : JSON.stringify(response.content);
    let title = responseText.trim();
    // Remove quotes
    title = title.replace(/^["']|["']$/g, "");
    // Truncate if too long
    if (title.length > 50) {
      title = title.substring(0, 47) + "...";
    }
    
    log.info({ messagePreview: message.substring(0, 50), title }, "[ThreadNaming] Generated title");
    
    return title;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMessage }, "[ThreadNaming] Failed to generate title");
    throw error;
  }
}

/**
 * Process a thread naming job (called by the BullMQ worker)
 */
export async function processThreadNamingJob(
  input: ThreadNamingJobInput
): Promise<ThreadNamingResult> {
  const { threadId, message } = input;
  const context: LogContext = {
    threadId,
    stage: "processThreadNamingJob",
  };
  const log = childLogger(context);
  
  try {
    log.info("[ThreadNaming] Processing naming job");
    
    // Generate the title
    const title = await generateTitle(message);
    
    // Store the title in Redis
    const redis = getRedis();
    const threadKey = `bernard:thread:${threadId}`;
    
    const existingData = await redis.get(threadKey);
    let threadData = existingData ? JSON.parse(existingData) : {};
    
    // Update with new title and metadata
    threadData = {
      ...threadData,
      title,
      namedAt: new Date().toISOString(),
    };
    
    await redis.set(threadKey, JSON.stringify(threadData));
    
    log.info({ threadId, title }, "[ThreadNaming] ✓ Thread named successfully");
    
    return {
      success: true,
      threadId,
      title,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMessage }, "[ThreadNaming] ✗ Failed to name thread");
    
    return {
      success: false,
      threadId,
      title: "New Chat",
    };
  }
}

/**
 * Check if a thread already has a name
 */
export async function threadHasName(threadId: string): Promise<boolean> {
  const redis = getRedis();
  const threadKey = `bernard:thread:${threadId}`;
  
  const existingData = await redis.get(threadKey);
  if (!existingData) {
    return false;
  }
  
    try {
    const threadData = JSON.parse(existingData);
    return !!(threadData.title && threadData.title !== "New Chat");
  } catch {
    return false;
  }
}

/**
 * Get the current thread name
 */
export async function getThreadName(threadId: string): Promise<string | null> {
  const redis = getRedis();
  const threadKey = `bernard:thread:${threadId}`;
  
  const existingData = await redis.get(threadKey);
  if (!existingData) {
    return null;
  }
  
  try {
    const threadData = JSON.parse(existingData);
    return threadData.title || null;
  } catch {
    return null;
  }
}

/**
 * Graph node: Name a thread if it doesn't have a name yet
 * 
 * This is a fire-and-forget operation that queues the naming job
 * without blocking the main graph flow.
 */
export async function nameThread(
  state: typeof BernardStateAnnotation.State,
  _config: LangGraphRunnableConfig
): Promise<Partial<typeof BernardStateAnnotation.State>> {
  const context: LogContext = {
    stage: "nameThread",
  };
  const log = childLogger(context);
  
  try {
    // Extract thread ID from configuration (placeholder for now)
    const threadId = "default";
    
    // Skip if thread already has a name
    if (await threadHasName(threadId)) {
      log.info({ threadId }, "[ThreadNaming] Thread already named, skipping");
      return {};
    }
    
    // Get first user message (HumanMessage has role="human")
    const firstUserMessage = state.messages.find((m) => m instanceof HumanMessage);
    if (!firstUserMessage) {
      log.info("[ThreadNaming] No user message found, skipping");
      return {};
    }
    
    // Queue naming job with deduplication
    const { addUtilityJob } = await import("@/lib/infra/queue");
    const messageContent = firstUserMessage?.content;
    const messageText = typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent);
    
    await addUtilityJob("thread-naming", {
      threadId,
      message: messageText,
    }, {
      jobId: `thread-naming:${threadId}`,
      deduplicationId: `thread-naming:${threadId}`,
    });
    
    log.info({ threadId }, "[ThreadNaming] ✓ Naming job queued");
    
    // Fire-and-forget: return empty update
    return {};
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn({ error: errorMessage }, "[ThreadNaming] Failed to queue naming job, continuing");
    
    // Graceful degradation: continue without naming
    return {};
  }
}
