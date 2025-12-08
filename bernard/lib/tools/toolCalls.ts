import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { parseToolCall } from "@langchain/core/output_parsers/openai_tools";

import { tools as baseTools } from "@/libs/tools";
import { isRecord, parseToolInput, safeStringify } from "../messages";

export type ToolCallRecord = { name?: string; function?: { name?: string; arguments?: unknown }; [key: string]: unknown };
export type ToolCallMessage = { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } };

export type ToolValidationError = { call: ToolCallRecord; reason: string };

export type ToolVerificationResult = boolean | { ok: boolean; reason?: string };

export type InstrumentedTool = {
  name: string;
  description: string;
  schema?: unknown;
  invoke: (input: unknown, runOpts?: unknown) => Promise<unknown>;
};

export type ConfiguredTool = InstrumentedTool & {
  verifyConfiguration?: () => ToolVerificationResult;
};

export type ToolAvailability = {
  ready: InstrumentedTool[];
  unavailable: Array<{ name: string; reason: string }>;
};

export function normalizeToolCalls(toolCalls: unknown[]): ToolCallRecord[] {
  return toolCalls.map((call, index) => {
    if (!call || typeof call !== "object") {
      const fallbackNameRaw =
        typeof call === "string" && call.trim() ? call.trim() : safeStringify(call ?? "tool_call");
      const fallbackName = fallbackNameRaw || "tool_call";
      const fallbackId = `${fallbackName}_${index}`;
      return {
        id: fallbackId,
        name: fallbackName,
        type: "tool_call",
        args: {},
        function: { name: fallbackName, arguments: "{}" }
      } as ToolCallRecord;
    }

    const record = { ...(call as ToolCallRecord) };
    const rawName = (record as { name?: unknown }).name;
    const fnName = record.function?.name;
    const name =
      typeof rawName === "string" && rawName.trim()
        ? rawName.trim()
        : typeof fnName === "string" && fnName.trim()
          ? fnName.trim()
          : "tool_call";
    const rawId = (record as { id?: unknown }).id;
    const id =
      typeof rawId === "string" && rawId.trim()
        ? rawId
        : `${name}_${index}`;

    const rawArgs =
      (record as { arguments?: unknown }).arguments ??
      (record as { args?: unknown }).args ??
      (record as { input?: unknown }).input ??
      record.function?.arguments;

    const parsedArgs = parseToolInput(rawArgs);
    const normalizedArgs =
      parsedArgs === undefined
        ? {}
        : isRecord(parsedArgs)
          ? parsedArgs
          : { value: parsedArgs };

    const functionArguments =
      isRecord(record.function) && record.function.arguments !== undefined
        ? record.function.arguments
        : typeof rawArgs === "string"
          ? rawArgs
          : safeStringify(normalizedArgs);

    const functionName =
      isRecord(record.function) && typeof record.function.name === "string" && record.function.name.trim()
        ? record.function.name.trim()
        : name;

    const typeCandidate = (record as { type?: unknown }).type;
    const type = typeof typeCandidate === "string" && typeCandidate.trim() ? typeCandidate : "tool_call";

    return {
      ...record,
      id,
      name,
      type,
      args: normalizedArgs,
      function: {
        ...(isRecord(record.function) ? record.function : {}),
        name: functionName,
        arguments: functionArguments
      }
    };
  });
}

export function parseToolCallsWithParser(message: BaseMessage): ToolCallRecord[] {
  const rawCalls = extractToolCallsFromMessage(message as ToolCallMessage);
  if (!rawCalls.length) return [];

  const parsed: ToolCallRecord[] = [];
  for (const call of rawCalls) {
    try {
      const clone: unknown = JSON.parse(JSON.stringify(call));
      const parsedCall: unknown = parseToolCall(clone as Record<string, unknown>, { returnId: true, partial: false });
      if (parsedCall) {
        const argsRaw = (parsedCall as { args?: unknown }).args;
        const argsParsed = parseToolInput(argsRaw);
        const args = argsParsed === undefined ? {} : isRecord(argsParsed) ? argsParsed : { value: argsParsed };
        const name = (parsedCall as { name?: string; type?: string }).name ?? (parsedCall as { type?: string }).type ?? "tool";
        parsed.push({
          id: (parsedCall as { id?: string }).id ?? name,
          type: "tool_call",
          name,
          args,
          function: {
            name,
            arguments: typeof argsRaw === "string" ? argsRaw : safeStringify(args)
          }
        });
        continue;
      }
    } catch {
      // swallow and normalize below
    }

    // Fallback to normalized call with args defaulted.
    const normalized = normalizeToolCalls([call])[0];
    if (normalized) parsed.push(normalized);
  }

  return parsed;
}

export function hasToolCall(messages: BaseMessage[]): boolean {
  const last = messages[messages.length - 1];
  const toolCalls = (last as { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } } | undefined)?.tool_calls;
  const nestedToolCalls = (last as { additional_kwargs?: { tool_calls?: unknown[] } } | undefined)?.additional_kwargs?.tool_calls;
  const toolCallChunks = (last as { tool_call_chunks?: unknown[]; additional_kwargs?: { tool_call_chunks?: unknown[] } } | undefined)?.tool_call_chunks;
  const nestedToolCallChunks = (last as { additional_kwargs?: { tool_call_chunks?: unknown[] } } | undefined)?.additional_kwargs?.tool_call_chunks;

  return (
    (Array.isArray(toolCalls) && toolCalls.length > 0) ||
    (Array.isArray(nestedToolCalls) && nestedToolCalls.length > 0) ||
    (Array.isArray(toolCallChunks) && toolCallChunks.length > 0) ||
    (Array.isArray(nestedToolCallChunks) && nestedToolCallChunks.length > 0)
  );
}

export function isRespondToolCall(call: ToolCallRecord): boolean {
  const name = call?.name ?? call.function?.name;
  return name === "respond";
}

export function extractToolCallsFromMessage(message: ToolCallMessage | null | undefined): ToolCallRecord[] {
  if (!message) return [];
  const direct = (message as { tool_calls?: unknown[] }).tool_calls;
  const nested = (message as { additional_kwargs?: { tool_calls?: unknown[] } }).additional_kwargs?.tool_calls;
  if (Array.isArray(direct) && direct.length) return normalizeToolCalls(direct);
  if (Array.isArray(nested) && nested.length) return normalizeToolCalls(nested);
  return [];
}

export function latestToolCalls(messages: BaseMessage[]): ToolCallRecord[] {
  if (!messages.length) return [];
  const last = messages[messages.length - 1];
  return extractToolCallsFromMessage(last as { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } });
}

export function dropRespondToolCalls(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter((message) => !extractToolCallsFromMessage(message as ToolCallMessage).some(isRespondToolCall));
}

export function validateToolCalls(toolCalls: ToolCallRecord[], allowedTools: Set<string>): {
  valid: ToolCallRecord[];
  invalid: ToolValidationError[];
} {
  const valid: ToolCallRecord[] = [];
  const invalid: ToolValidationError[] = [];

  for (const call of toolCalls) {
    const name = (call?.name ?? call.function?.name) as unknown;
    const id = (call as { id?: unknown }).id ?? (call as { function?: { name?: unknown } }).function?.name ?? name;

    if (typeof name !== "string" || !name.trim()) {
      invalid.push({ call, reason: "Tool call is missing a valid name" });
      continue;
    }

    if (!allowedTools.has(name)) {
      invalid.push({ call, reason: `Tool "${name}" is not available` });
      continue;
    }

    if (typeof id !== "string" || !id.trim()) {
      invalid.push({ call, reason: `Tool "${name}" is missing a valid id` });
      continue;
    }

    const argsRaw =
      (call as { arguments?: unknown }).arguments ??
      call.function?.arguments ??
      (call as { args?: unknown }).args ??
      (call as { input?: unknown }).input;

    const parsedArgs = parseToolInput(argsRaw);
    const normalizedArgs =
      parsedArgs === undefined ? {} : isRecord(parsedArgs) ? parsedArgs : ({ value: parsedArgs } as Record<string, unknown>);
    const normalizedCall: ToolCallRecord = {
      ...call,
      id,
      name,
      args: normalizedArgs,
      function: {
        ...(call.function ?? {}),
        name,
        arguments: typeof argsRaw === "string" ? argsRaw : safeStringify(normalizedArgs)
      }
    };

    valid.push(normalizedCall);
  }

  return { valid, invalid };
}

export function buildToolValidationMessage(invalid: ToolValidationError[]): string {
  const details = invalid.map(({ call, reason }) => {
    const name = call?.name ?? call.function?.name ?? "unknown_tool";
    const id = (call as { id?: unknown }).id ?? "missing_id";
    const idText = typeof id === "string" ? id : safeStringify(id);
    return `${reason} (tool="${name}", id="${idText}")`;
  });
  return (
    `${details.join("; ")}. ` +
    "Your last attempt to call a tool failed, try again with the correct format, tools, and arguments."
  );
}

function normalizeVerificationResult(result: ToolVerificationResult): { ok: boolean; reason?: string } {
  if (typeof result === "boolean") return { ok: result };
  const normalized: { ok: boolean; reason?: string } = { ok: result.ok };
  if (result.reason) normalized.reason = result.reason;
  return normalized;
}

export function evaluateToolAvailability(toolsList: ConfiguredTool[] = baseTools as ConfiguredTool[]): ToolAvailability {
  const ready: InstrumentedTool[] = [];
  const unavailable: ToolAvailability["unavailable"] = [];

  for (const tool of toolsList) {
    if (!tool.verifyConfiguration) {
      ready.push(tool);
      continue;
    }

    try {
      const verification = normalizeVerificationResult(tool.verifyConfiguration());
      if (verification.ok) {
        ready.push(tool);
      } else {
        unavailable.push({
          name: tool.name,
          reason: verification.reason ?? "Tool configuration is missing or invalid."
        });
      }
    } catch (err) {
      unavailable.push({
        name: tool.name,
        reason:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Tool configuration verification failed."
      });
    }
  }

  return { ready, unavailable };
}

export function buildToolAvailabilityMessage(unavailable: ToolAvailability["unavailable"]): string | null {
  if (!unavailable.length) return null;
  const summary = unavailable.map((t) => `${t.name}: ${t.reason}`).join("; ");
  return `Unavailable tools (configuration errors): ${summary}`;
}

export function ensureToolAvailabilityContext(messages: BaseMessage[], availabilityMessage: string | null): BaseMessage[] {
  if (!availabilityMessage) return messages;
  const hasAvailabilityContext = messages.some(
    (message) =>
      (message as { _getType?: () => string })._getType?.() === "system" &&
      (message as { content?: unknown }).content === availabilityMessage
  );
  if (hasAvailabilityContext) return messages;
  return [...messages, new SystemMessage({ content: availabilityMessage })];
}

export function canonicalToolCalls(
  toolCalls: ToolCallRecord[],
  normalizeArgs: (raw: unknown) => unknown = parseToolInput
): string | null {
  if (!toolCalls.length) return null;
  const normalized = toolCalls
    .filter((call) => !isRespondToolCall(call))
    .map((call) => {
      const name = call.name ?? call.function?.name ?? "unknown_tool";
      const args = isRecord((call as { args?: unknown }).args)
        ? (call as { args?: Record<string, unknown> }).args
        : normalizeArgs(
            (call as { arguments?: unknown }).arguments ?? call.function?.arguments ?? (call as { input?: unknown }).input
          );
      return { name, args };
    });
  normalized.sort((a, b) => {
    if (a.name === b.name) return safeStringify(a.args).localeCompare(safeStringify(b.args));
    return a.name.localeCompare(b.name);
  });
  return safeStringify(normalized);
}

export function stripIntentOnlySystemMessages(
  messages: BaseMessage[],
  toolFormatInstructions: string,
  intentPrompt: string
): BaseMessage[] {
  return messages.filter((message) => {
    const isSystem = (message as { _getType?: () => string })._getType?.() === "system";
    if (!isSystem) return true;
    const content = (message as { content?: unknown }).content;
    if (typeof content !== "string") return true;
    if (content === toolFormatInstructions) return false;
    if (content === intentPrompt) return false;
    return true;
  });
}


