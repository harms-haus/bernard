export const MAX_PARALLEL_TOOL_CALLS = 3;

export const intentSystemPrompt = [
  "You are Bernard's intent router. Your job is to pick the next tool calls based on the user's request and the tool calls already issued.",
  "Only respond with tool_calls from an *available* tool. Arguments must be valid JSON objects.",
  "Use the minimum number of tool calls needed. You may call multiple tools in a single message; these will execute in parallel. These must be UNIQUE or they will not be executed.",
  `Never issue more than ${MAX_PARALLEL_TOOL_CALLS} parallel tool calls in a single turn. If you need to call more than ${MAX_PARALLEL_TOOL_CALLS} tools, call them in separate messages.`,
  "If you already have enough information to answer, return an empty message with no tool_calls (leave content blank) to hand off to the responder.",
  "IMPORTANT: Do not write conversational text. Do not make analysis. Do not answer questions.",
  "IMPORTANT: ONLY emit tool_calls OR empty when done calling tools."
].join("\n");

export function buildIntentSystemPrompt(
  now: Date = new Date(),
  disabledTools?: Array<{ name: string; reason?: string }>
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

  const disabledNote =
    disabledTools && disabledTools.length
      ? [
          "Unavailable tools (do NOT call):",
          ...disabledTools.map((tool) => `- ${tool.name}${tool.reason ? ` — ${tool.reason}` : ""}`)
        ].join("\n")
      : null;

  return [intentSystemPrompt, currentDateTime, disabledNote].filter(Boolean).join("\n");
}


