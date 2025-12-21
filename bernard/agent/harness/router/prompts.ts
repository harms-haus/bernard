export const MAX_PARALLEL_TOOL_CALLS = 6;

import type { ToolDefinition } from "@langchain/core/language_models/base";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";

type ToolLikeForPrompt = { name: string; description?: string; schema?: unknown };

export const routerSystemPrompt = [
  "You are Bernard's router. Your job is to pick the tool calls needed to complete the user's request.",
].join("\n");

export const routerHardStopSystemPrompt =
  "NEVER RESPOND TO THE USER: Do not make conversation, do not answer questions, do not create, collate, or analyze data, ONLY respond to the system with TOOL CALLS.";

export function buildRouterSystemPrompt(
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
    routerSystemPrompt,
    buildLangChainToolSystemPrompt(tools),
    buildUnavailableToolsPrompt(disabledTools),
    routerHardStopSystemPrompt
  ];

  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}

export function buildLangChainToolSystemPrompt(tools: ToolLikeForPrompt[]): string | null {
  if (!tools.length) return null;
  return [
    `You have access to tools. When you call a tool, return an assistant message containing up to ${MAX_PARALLEL_TOOL_CALLS} tool_calls in parallel. Tool_calls must be UNIQUE or they will not be executed.
Reuse tool results from the conversation history if they are still valid.
Mark the end of tool calling with the \"respond\" tool call. It may be added to the same message as the last tool calls necessary or in a separate message.
Do not add conversational text. Only tool calls.

WORKFLOW:
1. If you need information to complete the user's request, call information-gathering tools
   a. For narrow topics, prioritize tools that give the most correct and complete information where possible.
   b. For wide topics, prioritize tools that can get the quickest summary answer.
2. If you are asked to perform an action, call action tools that you have available.
   a. Prioritize specialized tools that can perform the action quickly and efficiently.
   b. Use generalized tools where specialized tools are not available.
3. After all information is gathered and all action tools have been called and executed, call the "respond" tool to complete the request.
   a. Do not respond to the user yourself.
   b. IMPORTANT: Never call "respond" until you have executed all necessary actions.`]
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


