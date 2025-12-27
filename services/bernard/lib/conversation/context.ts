import type { BaseMessage, ToolCall} from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { MessageRecord } from "./types";
import { createMessageFingerprint, deduplicateMessages } from "./dedup";
import { buildRouterSystemPrompt } from "@/agent/harness/router/prompts";
import { buildResponseSystemPrompt } from "@/agent/harness/respond/prompts";
import type { ToolWithInterpretation } from "@/agent/tool";
import { normalizeRecordContent } from "./messages";

// Type for recollection content
interface RecollectionData {
  sourceConversationId?: string;
  content?: string;
  score?: number;
  conversationMetadata?: {
    summary?: string;
    tags?: string[];
  };
  messageStartIndex?: number;
  messageEndIndex?: number;
}

/**
 * Context interface for maintaining filtered conversation views
 */
export interface Context {
  // Get the filtered messages array ready for LLM consumption
  getMessages(): BaseMessage[];

  // Process a new message and update context if it matches filters
  // Deduplicates against already-seen messages
  processMessage(message: MessageRecord): void;

  // Initialize context with existing history
  // History should already be deduplicated from syncHistory()
  initializeWithHistory(history: MessageRecord[]): void;
}

/**
 * Base context class with common filtering and deduplication logic
 */
export abstract class BaseContext implements Context {
  protected messages: BaseMessage[] = [];
  protected seenFingerprints = new Set<string>();
  protected systemPrompt: string | null = null;

  constructor() {}

  abstract getMessages(): BaseMessage[];

  abstract shouldIncludeMessage(record: MessageRecord): boolean;

  abstract buildSystemPrompt(): string;

  /**
   * Initialize context with existing history
   * History should already be deduplicated from syncHistory()
   */
  initializeWithHistory(history: MessageRecord[]): void {
    this.messages = [];
    this.seenFingerprints.clear();

    // Process each historical message
    for (const record of history) {
      this.processMessage(record);
    }
  }

  /**
   * Process a new message and update context if it matches filters
   * Deduplicates against already-seen messages
   */
  processMessage(record: MessageRecord): void {
    const fingerprint = createMessageFingerprint(record);

    // Skip if we've already seen this message
    if (this.seenFingerprints.has(fingerprint)) {
      return;
    }

    // Check if message should be included in this context
    if (!this.shouldIncludeMessage(record)) {
      return;
    }

    // Convert to BaseMessage and add to context
    const baseMessage = this.messageRecordToBaseMessage(record);
    if (baseMessage) {
      this.messages.push(baseMessage);
      this.seenFingerprints.add(fingerprint);
    }
  }

  /**
   * Get the final filtered messages array with system prompt prepended
   */
  protected getFilteredMessages(): BaseMessage[] {
    // Apply final deduplication pass for safety
    const deduplicated = deduplicateMessages(this.messages);

    // Build system prompt if needed
    const systemPrompt = this.buildSystemPrompt();
    const systemMessage = systemPrompt ? new SystemMessage(systemPrompt) : null;

    // Return system message + filtered messages
    return systemMessage ? [systemMessage, ...deduplicated] : deduplicated;
  }

  /**
   * Convert MessageRecord to BaseMessage
   */
  private messageRecordToBaseMessage(record: MessageRecord): BaseMessage | null {
    // Special handling for recollection events
    if (record.name === "recollection" && record.role === "system") {
      return this.formatRecollectionMessage(record);
    }

    const normalizedContent = normalizeRecordContent(record.content);
    const base = { content: normalizedContent, ...(record.name ? { name: record.name } : {}) };

    switch (record.role) {
      case "system":
        return new SystemMessage(base);
      case "user":
        return new HumanMessage(base);
      case "assistant": {
        const content = typeof record.content === "string" ? record.content : JSON.stringify(record.content);
        const aiFields: { content: string; tool_calls?: ToolCall[]; name?: string } = { content };
        if (record.tool_calls?.length) {
          aiFields.tool_calls = record.tool_calls as ToolCall[];
        }
        if (record.name) {
          aiFields.name = record.name;
        }
        return new AIMessage(aiFields);
      }
      case "tool":
        return new ToolMessage({
          tool_call_id: record.tool_call_id ?? record.name ?? "tool_call",
          content: typeof record.content === "string" ? record.content : JSON.stringify(record.content),
          ...(record.name ? { name: record.name } : {})
        });
      default:
        return new HumanMessage(base);
    }
  }

  /**
   * Format a recollection event as a readable system message
   */
  private formatRecollectionMessage(record: MessageRecord): SystemMessage | null {
    try {
      if (typeof record.content !== "object" || !record.content) {
        return null;
      }

      const recollection = record.content as RecollectionData;
      let formattedContent = `Recalled from conversation ${recollection.sourceConversationId || 'unknown'}:\n`;

      if (recollection.content) {
        // Truncate content if too long
        const content = typeof recollection.content === 'string' ? recollection.content : JSON.stringify(recollection.content);
        formattedContent += content.length > 500 ? content.substring(0, 500) + '...' : content;
      }

      if (recollection.score !== undefined) {
        formattedContent += `\n\nSimilarity score: ${recollection.score.toFixed(3)}`;
      }

      if (recollection.conversationMetadata) {
        const meta = recollection.conversationMetadata;
        if (meta.summary) {
          formattedContent += `\n\nConversation summary: ${meta.summary}`;
        }
        if (meta.tags && meta.tags.length > 0) {
          formattedContent += `\n\nTags: ${meta.tags.join(', ')}`;
        }
      }

      if (recollection.messageStartIndex !== undefined && recollection.messageEndIndex !== undefined) {
        formattedContent += `\n\nMessage range: ${recollection.messageStartIndex}-${recollection.messageEndIndex}`;
      }

      return new SystemMessage({
        content: formattedContent,
        name: "recollection"
      });

    } catch (err) {
      console.warn('[formatRecollectionMessage] Failed to format recollection message:', err);
      return new SystemMessage({
        content: 'Recalled information (formatting failed)',
        name: "recollection"
      });
    }
  }
}

/**
 * Router context that maintains messages for the router harness
 */
export class RouterContext extends BaseContext {
  private toolDefinitions: ToolLikeForPrompt[] = [];
  private disabledTools: Array<{ name: string; reason?: string | undefined }> | undefined;

  constructor(
    toolDefinitions: ToolLikeForPrompt[] = [],
    disabledTools?: Array<{ name: string; reason?: string | undefined }>
  ) {
    super();
    this.toolDefinitions = toolDefinitions;
    this.disabledTools = disabledTools;
  }

  /**
   * Router context includes: system, user, assistant, tool, and recollection messages
   * Excludes: llm_call, llm_call_complete, respond messages
   */
  shouldIncludeMessage(record: MessageRecord): boolean {
    // Exclude system-level trace messages
    if (record.name === "llm_call" || record.name === "llm_call_complete" || record.name === "respond") {
      return false;
    }

    // Include recollection events (name="recollection")
    if (record.name === "recollection") {
      return true;
    }

    // Include user, assistant, system, and tool messages
    return ["user", "assistant", "system", "tool"].includes(record.role);
  }

  buildSystemPrompt(): string {
    return buildRouterSystemPrompt(new Date(), this.toolDefinitions, this.disabledTools);
  }

  getMessages(): BaseMessage[] {
    return this.getFilteredMessages();
  }
}

/**
 * Response context that maintains messages for the response harness
 */
export class ResponseContext extends BaseContext {
  private availableTools: Array<{ name: string; description?: string }> | undefined;
  private disabledTools: Array<{ name: string; reason?: string }> | undefined;
  private toolDefinitions: ToolWithInterpretation[] | undefined;
  private usedTools: string[] | undefined;
  private reason?: string;

  constructor(
    availableTools?: Array<{ name: string; description?: string }>,
    disabledTools?: Array<{ name: string; reason?: string }>,
    toolDefinitions?: ToolWithInterpretation[],
    usedTools?: string[],
    reason?: string
  ) {
    super();
    this.availableTools = availableTools;
    this.disabledTools = disabledTools;
    this.toolDefinitions = toolDefinitions;
    this.usedTools = usedTools;
    if (reason !== undefined) {
      this.reason = reason;
    }
  }

  setReason(reason: string) {
    this.reason = reason;
  }

  /**
   * Response context includes: system, user, assistant, tool, and recollection messages
   * Excludes: llm_call, llm_call_complete, respond messages
   */
  shouldIncludeMessage(record: MessageRecord): boolean {
    // Exclude system-level trace messages
    if (record.name === "llm_call" || record.name === "llm_call_complete" || record.name === "respond") {
      return false;
    }

    // Include recollection events (name="recollection")
    if (record.name === "recollection") {
      return true;
    }

    // Include user, assistant, system, and tool messages
    return ["user", "assistant", "system", "tool"].includes(record.role);
  }

  buildSystemPrompt(): string {
    return buildResponseSystemPrompt(
      new Date(),
      this.availableTools,
      this.disabledTools,
      this.toolDefinitions,
      this.usedTools,
      this.reason
    );
  }

  getMessages(): BaseMessage[] {
    return this.getFilteredMessages();
  }
}

/**
 * Tool-like interface for prompts
 */
export type ToolLikeForPrompt = { name: string; description?: string; schema?: unknown };
