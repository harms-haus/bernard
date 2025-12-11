import type { BaseMessage } from "@langchain/core/messages";

import { collectToolCalls, contentFromMessage } from "@/app/api/v1/_lib/openai";

export type ToolChunk = {
  tool_calls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_outputs: Array<{ id: string; content: string }>;
};

/**
 * Split an assistant reply into small streaming-friendly tokens.
 */
export function chunkContent(content: string): string[] {
  if (!content) return [];
  const parts = content.split(/(\s+)/).filter((part) => part.length);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const next = current + part;
    if (next.length > 32 && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [content];
}

/**
 * Reconstruct tool call/output pairs from a transcript for streaming deltas.
 */
export function buildToolChunks(transcript: BaseMessage[], historyLength: number): ToolChunk[] {
  const deltas = transcript.slice(historyLength);
  const chunks: ToolChunk[] = [];

  let pendingCalls: ToolChunk["tool_calls"] | null = null;
  let outputs: ToolChunk["tool_outputs"] = [];

  const flush = () => {
    if (pendingCalls || outputs.length) {
      chunks.push({
        tool_calls: pendingCalls ?? [],
        tool_outputs: outputs
      });
    }
    pendingCalls = null;
    outputs = [];
  };

  for (const message of deltas) {
    const calls = collectToolCalls([message]);
    if (calls.length) {
      flush();
      pendingCalls = calls;
      continue;
    }

    const type = (message as { _getType?: () => string })._getType?.();
    if (type === "tool") {
      const id =
        (message as { tool_call_id?: string }).tool_call_id ?? (message as { name?: string }).name ?? "tool_call";
      const content = contentFromMessage(message) ?? "";
      outputs.push({ id: String(id), content });
      continue;
    }

    if (pendingCalls || outputs.length) {
      flush();
    }
  }

  flush();
  return chunks.filter((chunk) => chunk.tool_calls.length || chunk.tool_outputs.length);
}


