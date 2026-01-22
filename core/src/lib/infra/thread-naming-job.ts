/**
 * Thread Naming Job Processor
 *
 * Handles thread naming job processing for the BullMQ worker.
 * This file exists to avoid circular dependencies between queue.ts and names.ts.
 */
import { getRedis } from '@/lib/infra/redis'
import { resolveUtilityModel } from '../config/models'
import { initChatModel } from 'langchain/chat_models/universal'
import { Client } from '@langchain/langgraph-sdk'
import { childLogger } from '../logging/logger'
import type { LogContext } from '../logging/logger'
import { initializeSettingsStore } from '../config/settingsStore'

export interface ThreadNamingJobInput {
  threadId: string;
  messages: Array<{ type: string; content: unknown }>;
}

export interface ThreadNamingResult {
  success: boolean;
  threadId: string;
  title: string;
}

/**
 * Generate a title for a thread based on the conversation messages
 */
export async function generateTitle(messages: Array<{ type: string; content: unknown }>): Promise<string> {
  const context: LogContext = {
    stage: "generateTitle",
  };
  const log = childLogger(context);

  try {
    const { id: modelId, options } = await resolveUtilityModel();

    const llm = await initChatModel(modelId, {
      ...options,
      temperature: 0.3,
      maxTokens: 30,
    });

    // Format messages for the prompt
    const messageHistory = messages
      .slice(0, 10) // Limit to first 10 messages for context
      .map(m => {
        let content = m.content;
        // Handle arrays first
        if (Array.isArray(content)) {
          // Extract text/content from array elements
          const textParts = content
            .map((item: unknown) => {
              if (typeof item === 'string') return item;
              if (typeof item === 'object' && item !== null) {
                const itemObj = item as Record<string, unknown>;
                if (typeof itemObj.content === 'string') return itemObj.content;
                if (typeof itemObj.text === 'string') return itemObj.text;
              }
              return null;
            })
            .filter((part): part is string => part !== null);
          content = textParts.length > 0 ? textParts.join(' ') : '[array message]';
        } else if (typeof content === 'object' && content !== null) {
          // Handle plain objects (not arrays)
          const contentObj = content as Record<string, unknown>;
          if (contentObj.content && typeof contentObj.content === 'string') {
            content = contentObj.content;
          } else if (contentObj.text && typeof contentObj.text === 'string') {
            content = contentObj.text;
          } else {
            // Fallback to a short summary
            content = `[complex message: ${Object.keys(contentObj).slice(0, 3).join(', ')}]`;
          }
        }
        return `[${m.type}]: ${content}`;
      })
      .join('\n');

    const systemPrompt = `You are a helpful assistant that generates short, concise thread titles.
Generate a title (3-6 words) that summarizes the conversation.
Do not use quotes or punctuation in the title.
Keep it simple and descriptive.
Example: "Weather forecast for Tokyo"`;

    const response = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate a title for this conversation:\n\n${messageHistory}` },
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

    // Fallback title if empty
    if (!title) {
      // Try to extract a title from the first human message
      const firstHuman = messages.find(m => m.type === 'human');
      if (firstHuman) {
        let content = typeof firstHuman.content === 'string' 
          ? firstHuman.content 
          : '[complex message]';
        // Take first few words
        title = content.split(' ').slice(0, 5).join(' ').replace(/[^a-zA-Z0-9 ]/g, '');
      }
    }

    // Final fallback
    if (!title) {
      title = 'New Chat';
    }

    // Log at info level without PII - use debug for detailed info
    log.info({ messageCount: messages.length, title }, "[ThreadNaming] Generated title");
    log.debug({ messagePreview: messageHistory.substring(0, 100), rawResponse: responseText }, "[ThreadNaming] Title generation details");

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
  const { threadId, messages } = input;
  const context: LogContext = {
    threadId,
    stage: "processThreadNamingJob",
  };
  const log = childLogger(context);

  try {
    log.info("[ThreadNaming] Processing naming job");

    // Initialize settings store (required for resolveModel -> getSettings -> getSettingsStore)
    await initializeSettingsStore(undefined, getRedis());

    const title = await generateTitle(messages);

    const redis = getRedis();
    const threadKey = `bernard:thread:${threadId}`;

    const existingData = await redis.get(threadKey);
    let threadData: Record<string, unknown> = {};
    
    if (existingData) {
      try {
        threadData = JSON.parse(existingData);
      } catch (parseError) {
        log.warn({ threadKey, error: parseError instanceof Error ? parseError.message : String(parseError) }, "[ThreadNaming] Failed to parse existing thread data, using empty object");
        // Optionally delete or overwrite malformed key
        threadData = {};
      }
    }

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
