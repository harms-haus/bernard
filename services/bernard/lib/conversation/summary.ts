import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import { resolveApiKey, resolveBaseUrl, resolveModel, splitModelAndProvider } from "../config/models";
import type { MessageRecord } from "./types";

/**
 * Flags returned by the summarizer indicating safety or parsing issues.
 */
export type SummaryFlags = { explicit?: boolean; forbidden?: boolean; summaryError?: boolean };

/**
 * Result payload from a conversation summary request.
 */
export type SummaryResult = {
  summary: string;
  tags: string[];
  keywords: string[];
  places: string[];
  flags: SummaryFlags;
  summaryError?: string;
};

export class ConversationSummaryService {
  private readonly model: ChatOpenAI;

  private constructor(model: ChatOpenAI) {
    this.model = model;
  }

  /**
   * Create a service instance from a preconfigured chat model.
   * Useful for testing where you want to inject a stubbed model.
   */
  static fromModel(model: ChatOpenAI) {
    return new ConversationSummaryService(model);
  }

  /**
   * Create a service using configured OpenRouter/OpenAI settings.
   */
  static async create(opts?: { model?: string; apiKey?: string; baseURL?: string }) {
    const resolvedModel = await resolveModel("utility", opts?.model ? { override: opts.model } : {});
    const { model, providerOnly } = splitModelAndProvider(resolvedModel.id);
    const mergedOptions = resolvedModel.options ?? {};
    const apiKey = resolveApiKey(opts?.apiKey, {
      ...mergedOptions,
      ...(opts?.apiKey ? { apiKey: opts.apiKey } : {})
    });
    const baseURL = resolveBaseUrl(opts?.baseURL, {
      ...mergedOptions,
      ...(opts?.baseURL ? { baseUrl: opts.baseURL } : {})
    });
    if (!apiKey) throw new Error("API key is required for summarization");

    const llm = new ChatOpenAI({
      model,
      apiKey,
      configuration: { baseURL },
      temperature: 0,
      ...(providerOnly ? { modelKwargs: { provider: { only: providerOnly } } } : {})
    });
    return new ConversationSummaryService(llm);
  }

  /**
   * Summarize a conversation, filtering traces and handling model errors gracefully.
   */
  async summarize(conversationId: string, messages: MessageRecord[]): Promise<SummaryResult> {
    const filtered = messages.filter(
      (message) => (message.metadata as { traceType?: string } | undefined)?.traceType !== "llm_call"
    );
    const trimmed = this.trimMessages(filtered, 80);
    const prompt = this.buildPrompt(conversationId, trimmed);
    try {
      const response = await this.model.invoke([
        new SystemMessage(
          "You are a concise archivist. Produce a safe, neutral summary and tags for a voice assistant conversation."
        ),
        new HumanMessage(prompt)
      ]);

      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const parsed = this.parseJson(content);
      return parsed;
    } catch (err) {
      return {
        summary: "",
        tags: [],
        keywords: [],
        places: [],
        flags: { summaryError: true },
        summaryError: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Keep only the most recent `limit` messages.
   */
  private trimMessages(messages: MessageRecord[], limit: number): MessageRecord[] {
    if (messages.length <= limit) return messages;
    return messages.slice(-limit);
  }

  /**
   * Build the summarization prompt with serialized message content.
   */
  private buildPrompt(conversationId: string, messages: MessageRecord[]): string {
    const entries = messages.map((m) => {
      const content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2).slice(0, 5000);
      return `[${m.role}] ${content}`;
    });
    return `Conversation ID: ${conversationId}

Please return strict JSON with:
- summary: <= 120 words, neutral
- tags: 3-8 short tags
- keywords: 5-10 concise phrases
- places: list of place/location hints (can be empty)
- flags: { explicit: boolean, forbidden: boolean }

Messages:
${entries.join("\n")}`;
  }

  /**
   * Parse LLM JSON output, falling back to empty values on error.
   */
  private parseJson(content: string): SummaryResult {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { summary: "", tags: [], keywords: [], places: [], flags: { summaryError: true } };
      }
      const summaryJson = parsed as {
        summary?: unknown;
        tags?: unknown;
        keywords?: unknown;
        places?: unknown;
        flags?: { explicit?: unknown; forbidden?: unknown; summaryError?: unknown };
      };

      return {
        summary: typeof summaryJson.summary === "string" ? summaryJson.summary : "",
        tags: this.toStringArray(summaryJson.tags),
        keywords: this.toStringArray(summaryJson.keywords),
        places: this.toStringArray(summaryJson.places),
        flags: {
          explicit: summaryJson.flags?.explicit === true,
          forbidden: summaryJson.flags?.forbidden === true,
          summaryError: summaryJson.flags?.summaryError === true
        }
      };
    } catch (err) {
      return {
        summary: "",
        tags: [],
        keywords: [],
        places: [],
        flags: { summaryError: true },
        summaryError: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Normalize unknown values to an array of strings.
   */
  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item));
  }
}

