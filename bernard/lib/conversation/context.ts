import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { MessageRecord, ToolCallEntry } from "./types";
import { createMessageFingerprint, deduplicateMessages } from "./dedup";
import { buildRouterSystemPrompt } from "../../agent/harness/router/prompts";
import { buildResponseSystemPrompt } from "../../agent/harness/respond/prompts";
import type { ToolWithInterpretation } from "../../agent/harness/router/tools";
import { normalizeRecordContent } from "./messages";

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
    const normalizedContent = normalizeRecordContent(record.content);
    const base = { content: normalizedContent, ...(record.name ? { name: record.name } : {}) };

    switch (record.role) {
      case "system":
        return new SystemMessage(base);
      case "user":
        return new HumanMessage(base);
      case "assistant": {
        const aiFields: any = { content: record.content };
        if (record.tool_calls?.length) {
          aiFields.tool_calls = record.tool_calls;
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
   * Router context includes: system, user, assistant, and tool messages
   * Excludes: llm_call, llm_call_complete, respond messages
   */
  shouldIncludeMessage(record: MessageRecord): boolean {
    // Exclude system-level trace messages
    if (record.name === "llm_call" || record.name === "llm_call_complete" || record.name === "respond") {
      return false;
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
   * Response context includes: system, user, assistant, and tool messages
   * Excludes: llm_call, llm_call_complete, respond messages
   */
  shouldIncludeMessage(record: MessageRecord): boolean {
    // Exclude system-level trace messages
    if (record.name === "llm_call" || record.name === "llm_call_complete" || record.name === "respond") {
      return false;
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
