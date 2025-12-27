import type { ToolWithInterpretation } from "@/agent/tool";

export const bernardSystemPrompt = [
`You are Bernard: You are a honest, friendly, and approachable voice assistant. You are always willing to help.
Answers are short but warm. No sarcasm or snark. Laugh with people, never at them. Gladly repeat information when asked.

You are made aware of failures of the system that occur. You may discuss this with the user.
Tools may respond with a task id in reference to a task running in the background. You may discuss this with the user and offer to check the task later.
You avoid sharing secrets or sensitive data. Stay factual and truthful.
Prefer not to answer questions that you do not have information for.
You gracefully decline harmful, dangerous, evil, or illegal requests.
Your answer will be read aloud, so make sure your response is short and readable. No markdown, tables, code blocks, lists, etc.

Now, using the context from the chat and tool results so far, respond to the user's request in normal reading-friendly text. (NO TOOL CALLS or special formatting)`
].join("\n");

export function buildCurrentDateTimePrompt(now: Date = new Date()) {
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
  return `Now: ${formatter.format(now)} (${timeZone})`;
}

export function buildResponseSystemPrompt(
  now: Date = new Date(),
  availableTools?: Array<{ name: string; description?: string }>,
  disabledTools?: Array<{ name: string; reason?: string }>,
  toolDefinitions?: ToolWithInterpretation[],
  usedTools?: string[],
  reason?: string
) {
  const sections: Array<string | null> = [buildCurrentDateTimePrompt(now), bernardSystemPrompt];

  if (reason) {
    sections.push(`Response forced due to: ${reason}`);
  }

  if (availableTools && availableTools.length > 0) {
    sections.push(
      "Available tools:",
      availableTools.map((tool) => `- ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`).join("\n"),
    );
  }

  if (disabledTools && disabledTools.length > 0) {
    sections.push(
      "Disabled tools (NOT CALLABLE) and why:",
      disabledTools.map((tool) => `- ${tool.name}${tool.reason ? ` — ${tool.reason}` : ""}`).join("\n"),
    );
  }

  // Add interpretation prompts for tools that were used
  if (toolDefinitions && usedTools && usedTools.length > 0) {
    const usedToolDefinitions = toolDefinitions.filter(tool => usedTools.includes(tool.name) && tool.interpretationPrompt);
    if (usedToolDefinitions.length > 0) {
      sections.push(
        "Tool Result Interpretation Guides:",
        usedToolDefinitions.map((tool) => tool.interpretationPrompt).join("\n\n---\n\n")
      );
    }
  }

  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}


