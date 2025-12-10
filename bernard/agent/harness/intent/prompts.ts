export const MAX_PARALLEL_TOOL_CALLS = 3;

import type { ToolDefinition } from "@langchain/core/language_models/base";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { renderTextDescriptionAndArgs } from "langchain/tools/render";

type ToolLikeForPrompt = { name: string; description?: string; schema?: unknown };

export const intentSystemPrompt = [
  "You are Bernard's intent router. Your job is to pick the tool calls needed to complete the user's request.",
  "Use the minimum number of tool calls needed to complete the user's request.",
  "You may call multiple tools in a single message; these will execute in parallel. These must be UNIQUE or they will not be executed.",
  "To finish calling tools, call the \"respond\" tool. This may be included in the same message as your final tool call."
].join("\n");

export const intentHardStopSystemPrompt =
  "NEVER RESPOND TO THE USER: Do not make conversation, do not answer questions, do not create, collate, or analyze data, ONLY respond to the system with TOOL CALLS.";

export function buildIntentSystemPrompt(
  now: Date = new Date(),
  tools: ToolLikeForPrompt[] = [],
  disabledTools?: Array<{ name: string; reason?: string | undefined }>
) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
    timeZoneName: "short"
  });
  const currentDateTime = `Current date/time: ${formatter.format(now)} (${timeZone})`;

  const sections: Array<string | null> = [
    currentDateTime,
    intentSystemPrompt,
    buildLangChainToolSystemPrompt(tools),
    buildUnavailableToolsPrompt(disabledTools),
    intentHardStopSystemPrompt
  ];

  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}

export function buildLangChainToolSystemPrompt(tools: ToolLikeForPrompt[]): string | null {
  if (!tools.length) return null;
  const toolDefinitions: ToolDefinition[] = tools.map((tool) =>
    convertToOpenAITool({
      // The LangChain converter handles StructuredTool instances directly;
      // for plain objects we provide name/description/schema.
      name: tool.name,
      description: tool.description ?? "",
      schema:
        tool.schema && typeof tool.schema === "object"
          ? tool.schema
          : { type: "object", properties: {}, additionalProperties: true }
    } as Record<string, unknown>)
  );

  // Keep tool listing compact: name + short description only.
  const toolList = toolDefinitions
    .map((tool) => {
      const name = tool.function?.name ?? "tool";
      const desc = tool.function?.description ?? "";
      return desc ? `${name}: ${desc}` : name;
    })
    .join("\n");
  return [
    "You have access to the following tools. When you call a tool, return a single assistant message containing only tool_calls with the tool name and JSON arguments that satisfy the tool's JSON schema. Do not add conversational text.",
    toolList
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUnavailableToolsPrompt(
  disabledTools?: Array<{ name: string; reason?: string | undefined }>
): string | null {
  if (!disabledTools || !disabledTools.length) return null;
  return [
    "Unavailable tools (do NOT call):",
    ...disabledTools.map((tool) => `- ${tool.name}${tool.reason ? ` — ${tool.reason}` : ""}`)
  ].join("\n");
}


