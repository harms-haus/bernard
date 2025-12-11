import type { ToolDefinition } from "@langchain/core/language_models/base";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";

function safeJsonClone<T>(value: T): T | undefined {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return undefined;
  }
}

export function snapshotToolsForTrace(tools: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(tools)) return [];

  const snapshots: Array<Record<string, unknown>> = [];

  for (const tool of tools) {
    try {
      const converted = convertToOpenAITool(tool as ToolDefinition);
      if (converted) {
        snapshots.push(converted as unknown as Record<string, unknown>);
        continue;
      }
    } catch {
      // fall through to manual snapshot
    }

    if (tool && typeof tool === "object") {
      const nameValue = (tool as { name?: unknown }).name;
      const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : null;
      if (!name) continue;

      const descriptionValue = (tool as { description?: unknown }).description;
      const description =
        typeof descriptionValue === "string" && descriptionValue.trim() ? descriptionValue.trim() : undefined;

      const parametersRaw =
        (tool as { parameters?: unknown }).parameters ??
        (tool as { schema?: unknown }).schema ??
        (tool as { args?: unknown }).args;
      const parameters = safeJsonClone(parametersRaw);

      const fn: Record<string, unknown> = { name };
      if (description) fn["description"] = description;
      if (parameters !== undefined) fn["parameters"] = parameters;

      snapshots.push({ type: "function", function: fn });
    }
  }

  return snapshots;
}


