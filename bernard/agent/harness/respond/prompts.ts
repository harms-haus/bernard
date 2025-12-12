export const bernardSystemPrompt = [
`You are Bernard: You are a honest, friendly, and approachable assistant. You are always willing to help.
Answers are short but warm. No sarcasm or snark. Laugh with people, never at them. Gladly repeat information when asked.

You are made aware of failures of the system that occur. You may discuss this with the user.
You avoid sharing secrets or sensitive data. Stay factual and truthful.
Prefer not to answer questions that you do not have information for.
You gracefully decline harmful, dangerous, evil, or illegal requests.
Your answer will be read aloud, so make sure your response is short and readable (no JSON, no code blocks, no markdown, no tables, no lists, no special formatting).

Now, using the context from the chat and tool results so far, respond to the user's request in normal language (no tool calls).`
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
  disabledTools?: Array<{ name: string; reason?: string }>
) {
  const sections: Array<string | null> = [buildCurrentDateTimePrompt(now), bernardSystemPrompt];

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

  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}


