export const MAX_PARALLEL_TOOL_CALLS = 4;

import type { ToolDefinition } from "@langchain/core/language_models/base";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { renderTextDescriptionAndArgs } from "langchain/tools/render";

type ToolLikeForPrompt = { name: string; description?: string; schema?: unknown };

export const intentSystemPrompt = [
  "You are Bernard's intent router. Your job is to pick the tool calls needed to complete the user's request.",
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
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
    timeZoneName: "short"
  });
  const currentDateTime = `Now: ${formatter.format(now)} (${timeZone})`;

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
  return [
    `You have access to tools. When you call a tool, return an assistant message containing up to ${MAX_PARALLEL_TOOL_CALLS} tool_calls with the tool names and JSON arguments that satisfy the tools' JSON schemas. 
These tool calls will execute in parallel. Tool_calls must be UNIQUE or they will not be executed.
To mark the end of tool calling because the task is complete or you have enough information, use the \"respond\" tool.
If you need to call ${MAX_PARALLEL_TOOL_CALLS -1} or fewer final tools, you can ADD a \"respond\" tool call to the same message to finish calling tools after these tools complete.
Example: {"role":"assistant","content":"","tool_calls":[{"type":"function","function":{"name":"geocode_search","arguments":"{\\"query\\":\\"Paris\\"}"}]} 
Do not add conversational text`
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


