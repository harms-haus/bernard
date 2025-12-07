import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import type { MessageRecord } from "./recordKeeper";
import { getPrimaryModel, resolveApiKey, resolveBaseUrl } from "./models";

export type SummaryFlags = { explicit?: boolean; forbidden?: boolean; summaryError?: boolean };

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

  constructor(opts?: { model?: string; apiKey?: string; baseURL?: string }) {
    const model = opts?.model ?? getPrimaryModel("aggregation");
    const apiKey = opts?.apiKey ?? resolveApiKey();
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for summarization");

    this.model = new ChatOpenAI({
      model,
      apiKey,
      configuration: { baseURL: resolveBaseUrl(opts?.baseURL) },
      temperature: 0
    });
  }

  async summarize(conversationId: string, messages: MessageRecord[]): Promise<SummaryResult> {
    const trimmed = this.trimMessages(messages, 80);
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

  private trimMessages(messages: MessageRecord[], limit: number): MessageRecord[] {
    if (messages.length <= limit) return messages;
    return messages.slice(-limit);
  }

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

  private parseJson(content: string): SummaryResult {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!parsed || typeof parsed !== "object") {
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

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item));
  }
}

