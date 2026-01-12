/**
 * Thread Naming Job Processor
 * 
 * Handles thread naming job processing for the BullMQ worker.
 * This file exists to avoid circular dependencies between queue.ts and names.ts.
 */
import { getRedis } from '@/lib/infra/redis'
import { resolveModel } from '../config/models'
import { initChatModel } from 'langchain/chat_models/universal'
import { Client } from '@langchain/langgraph-sdk'
import { childLogger } from '../logging/logger'
import type { LogContext } from '../logging/logger'

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
    const { id: modelId, options } = await resolveModel("utility");
    
    const llm = await initChatModel(modelId, {
      ...options,
      temperature: 0.3,
      maxTokens: 30,
    });
    
    const systemPrompt = `You are a helpful assistant that generates short, concise thread titles.
Generate a title (3-6 words) that summarizes the user's message.
Do not use quotes or punctuation in the title.
Keep it simple and descriptive.
Example: "Weather forecast for Tokyo"`;
    
    const response = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate a title for this message: "${message}"` },
    ]);
    
    // Clean response and sanitize
    const responseText = typeof response.content === "string" 
      ? response.content 
      : JSON.stringify(response.content);
    let title = responseText.trim();
    title = title.replace(/^["']|["']$/g, "");
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
    
    const title = await generateTitle(message);
    
    const redis = getRedis();
    const threadKey = `bernard:thread:${threadId}`;
    
    const existingData = await redis.get(threadKey);
    let threadData = existingData ? JSON.parse(existingData) : {};
    
    threadData = {
      ...threadData,
      title,
      namedAt: new Date().toISOString(),
    };
    
    await redis.set(threadKey, JSON.stringify(threadData));
    
    // Also update via LangGraph SDK so UI sees the new name
    const client = new Client({
      apiUrl: process.env['LANGGRAPH_API_URL'] ?? "http://localhost:2024",
    });
    
    await client.threads.update(threadId, {
      metadata: {
        name: title,
        updatedAt: new Date().toISOString(),
      },
    });
    
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
