import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import {
  METADATA_EXTRACTORS,
  type MetadataCategory,
  type MetadataExtractorDescriptor,
  type MetadataKey,
  type MetadataMap,
  type MetadataValue
} from "./extractors";
import { getPrimaryModel, resolveApiKey, resolveBaseUrl } from "../models";

type ChatModel = Pick<ChatOpenAI, "invoke">;

export type MetadataExtractorInput = {
  text: string;
  category?: string | string[];
  now?: Date;
  currentLocation?: string | null;
};

export type MetadataExtractorResult = {
  metadata: MetadataMap;
  raw: string;
};

type BaseContext = {
  cur_time: string;
  cur_date: string;
  cur_location?: string;
};

type ExtractorRunResult = {
  key: MetadataKey;
  value: MetadataValue;
  raw: string;
};

export const METADATA_CATEGORIES: MetadataCategory[] = Array.from(
  new Set(METADATA_EXTRACTORS.map((e) => e.category))
);

function buildBaseContext(now: Date, currentLocation?: string | null): BaseContext {
  const trimmedLocation = currentLocation?.trim();
  const base: BaseContext = {
    cur_time: now.toISOString(),
    cur_date: now.toISOString().slice(0, 10)
  };
  if (trimmedLocation) base.cur_location = trimmedLocation;
  return base;
}

export function parseCategoryFilter(input?: string | string[]): Set<MetadataCategory> {
  const all = new Set<MetadataCategory>(METADATA_CATEGORIES);
  if (!input) return all;

  const raw = Array.isArray(input) ? input : input.split(",");
  const selected = new Set<MetadataCategory>();

  for (const entry of raw) {
    const normalized = entry.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === "all") return all;
    if (all.has(normalized as MetadataCategory)) selected.add(normalized as MetadataCategory);
  }

  return selected.size ? selected : all;
}

function orderedEntries(metadata: MetadataMap): Array<[MetadataKey | string, MetadataValue]> {
  const seen = new Set<string>();
  const entries: Array<[MetadataKey | string, MetadataValue]> = [];
  for (const descriptor of METADATA_EXTRACTORS) {
    const value = metadata[descriptor.key];
    if (value !== undefined) {
      entries.push([descriptor.key, value]);
      seen.add(descriptor.key);
    }
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (!seen.has(key)) entries.push([key, value]);
  }
  return entries;
}

const SPECIAL_QUOTE_CHARS = new Set(["{", "}", "[", "]", ",", "&", "*", "#", "?", "!", "|", ">", "'", '"', "%", "@", "`"]);

function needsQuoting(value: string): boolean {
  if (value === "") return true;
  if (/^\s|\s$|\n/.test(value)) return true;
  for (const char of SPECIAL_QUOTE_CHARS) {
    if (value.includes(char)) return true;
  }
  if (/:/.test(value) && /\s/.test(value)) return true;
  return false;
}

export function metadataToYaml(metadata: MetadataMap): string {
  const entries = orderedEntries(metadata).filter(([, value]) => value !== undefined);
  if (!entries.length) return "";
  return entries
    .map(([key, value]) => {
      if (value === null) return `${key}: null`;
      const text = String(value);
      return `${key}: ${needsQuoting(text) ? JSON.stringify(text) : text}`;
    })
    .join("\n");
}

export class MetadataExtractor {
  private readonly model: ChatModel;

  constructor(opts: { model?: ChatModel } = {}) {
    const apiKey = resolveApiKey();
    if (!opts.model && !apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for metadata extraction");
    }

    this.model =
      opts.model ??
      new ChatOpenAI({
        model: getPrimaryModel("aggregation"),
        apiKey,
        configuration: { baseURL: resolveBaseUrl() },
        temperature: 0
      });
  }

  async extract(input: MetadataExtractorInput): Promise<MetadataExtractorResult> {
    const now = input.now ?? new Date();
    const baseContext = buildBaseContext(now, input.currentLocation);
    const text = input.text?.trim() ?? "";
    const categories = parseCategoryFilter(input.category);

    const metadata: MetadataMap = {};

    if (categories.has("context")) {
      metadata.cur_time = baseContext.cur_time;
      metadata.cur_date = baseContext.cur_date;
    }
    if (categories.has("location")) {
      metadata.cur_location = baseContext.cur_location ?? null;
    }

    const extractors = METADATA_EXTRACTORS.filter((descriptor) => categories.has(descriptor.category));
    if (!extractors.length) {
      return { metadata, raw: "" };
    }

    const results = await Promise.all(
      extractors.map((descriptor) => this.runExtractor({ descriptor, text, baseContext }))
    );

    const rawPieces: string[] = [];
    for (const result of results) {
      rawPieces.push(`${result.key}: ${result.raw}`.trim());
      metadata[result.key] = result.value;
    }

    return { metadata, raw: rawPieces.filter(Boolean).join("\n") };
  }

  private async runExtractor({
    descriptor,
    text,
    baseContext
  }: {
    descriptor: MetadataExtractorDescriptor;
    text: string;
    baseContext: BaseContext;
  }): Promise<ExtractorRunResult> {
    if (descriptor.category === "context") {
      const value = this.normalizeValue(baseContext[descriptor.key as keyof BaseContext]);
      return { key: descriptor.key, value: value ?? null, raw: value ?? "" };
    }

    const baseValue = (baseContext as Record<string, unknown>)[descriptor.key];
    if (baseValue !== undefined) {
      const normalized = this.normalizeValue(baseValue);
      return { key: descriptor.key, value: normalized ?? null, raw: normalized ?? "" };
    }

    if (!text) {
      return { key: descriptor.key, value: null, raw: "" };
    }

    const { system, user } = this.buildPrompt(descriptor, text, baseContext);
    const response = await this.model.invoke([new SystemMessage(system), new HumanMessage(user)]);
    const rawContent = this.extractContent(response);
    return { key: descriptor.key, value: this.parseSingleValue(descriptor.key, rawContent), raw: rawContent };
  }

  private buildPrompt(descriptor: MetadataExtractorDescriptor, text: string, baseContext: BaseContext): {
    system: string;
    user: string;
  } {
    const base = JSON.stringify(baseContext, null, 2);
    const system = `You extract one metadata field from a user message.

${descriptor.systemPrompt}
Return STRICT JSON with exactly one key "${descriptor.key}" whose value is the extracted value or null. Use null when no value is present. Keep the value concise.`;

    const user = `Current context (do not alter):
${base}

User message:
"""${text}"""

Return JSON with only the key "${descriptor.key}".`;
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

  private parseSingleValue(key: MetadataKey, raw: string): MetadataValue {
    const parsed = this.safeParse(raw);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (key in record) {
        return this.normalizeValue(record[key]);
      }
      if ("value" in record) {
        return this.normalizeValue((record as { value?: unknown }).value);
      }
      return null;
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed.toLowerCase() === "null") return null;
    return this.normalizeValue(trimmed);
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

