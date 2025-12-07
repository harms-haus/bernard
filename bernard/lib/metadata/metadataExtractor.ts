import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import { METADATA_EXTRACTORS, METADATA_KEYS, type MetadataMap, type MetadataValue } from "./extractors";

type ChatModel = Pick<ChatOpenAI, "invoke">;

export type MetadataExtractorInput = {
  text: string;
  now?: Date;
  currentLocation?: string | null;
};

export type MetadataExtractorResult = {
  metadata: MetadataMap;
  raw: string;
};

export class MetadataExtractor {
  private readonly model: ChatModel;

  constructor(opts: { model?: ChatModel } = {}) {
    if (!opts.model && !process.env["OPENROUTER_API_KEY"]) {
      throw new Error("OPENROUTER_API_KEY is required for metadata extraction");
    }

    this.model =
      opts.model ??
      new ChatOpenAI({
        model: process.env["OPENROUTER_MODEL"] ?? "kwaipilot/KAT-coder-v1:free",
        apiKey: process.env["OPENROUTER_API_KEY"],
        configuration: {
          baseURL: process.env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1"
        },
        temperature: 0
      });
  }

  async extract(input: MetadataExtractorInput): Promise<MetadataExtractorResult> {
    const now = input.now ?? new Date();
    const baseMetadata: MetadataMap = {
      cur_time: now.toISOString(),
      cur_date: now.toISOString().slice(0, 10),
      ...(input.currentLocation ? { cur_location: input.currentLocation } : {})
    };

    const text = input.text?.trim() ?? "";
    if (!text) {
      return { metadata: baseMetadata, raw: "" };
    }

    const prompt = this.buildPrompt(text, baseMetadata);
    const response = await this.model.invoke([new SystemMessage(prompt.system), new HumanMessage(prompt.user)]);
    const rawContent = this.extractContent(response);
    const parsed = this.parseMetadata(rawContent, baseMetadata);

    return { metadata: parsed, raw: rawContent };
  }

  private buildPrompt(text: string, baseMetadata: MetadataMap): { system: string; user: string } {
    const extractorLines = METADATA_EXTRACTORS.map(
      (e) => `- ${e.key} [${e.category}]: ${e.systemPrompt}`
    ).join("\n");

    const expectedKeys = METADATA_KEYS.join(", ");
    const baseContext = JSON.stringify(baseMetadata, null, 2);

    const system = `You extract concise metadata from a single user message.
Return STRICT JSON with only the expected keys. Use null when no value is present.
Keep values short phrases, no prose, no lists unless present in the text.
Do not add commentary. Keys: ${expectedKeys}
Rules:
${extractorLines}`;

    const user = `Current context (do not change provided values):
${baseContext}

User message:
"""${text}"""

Return JSON with all keys (${expectedKeys}).`;

    return { system, user };
  }

  private extractContent(result: unknown): string {
    if (typeof result === "string") return result;
    if (result && typeof result === "object") {
      const content = (result as { content?: unknown }).content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
              return (part as { text: string }).text;
            }
            return "";
          })
          .join("");
      }
    }
    return "";
  }

  private parseMetadata(raw: string, base: MetadataMap): MetadataMap {
    const merged: MetadataMap = { ...base };
    const parsed = this.safeParse(raw);
    if (!parsed || typeof parsed !== "object") return merged;
    const record = parsed as Record<string, unknown>;

    for (const key of METADATA_KEYS) {
      if (key in record) {
        merged[key] = this.normalizeValue(record[key]);
      }
    }

    return merged;
  }

  private safeParse(raw: string): unknown {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private normalizeValue(value: unknown): MetadataValue {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
      const joined = value
        .map((v) => this.normalizeValue(v))
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      return joined.length ? joined.join("; ") : null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return null;
  }
}

