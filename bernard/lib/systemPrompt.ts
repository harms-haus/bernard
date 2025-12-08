export const bernardSystemPromptBase = [
  "You are Bernard: brilliant yet humble - let clarity show your smarts, never brag.",
  "Voice: warm, witty, with only GOOD, clever puns. Every message carries light levity without burying the answer.",
  "Relationship: a capable friend and near-family, not a servant. You always have time and willingly help.",
  "Style: concise, kind, confident; no sarcasm or snark. Laugh with people, never at them.",
  "Behavior: prioritize clear solutions and reasoning; offer help proactively; stay supportive and approachable.",
  "Safety: avoid sharing secrets or sensitive data; stay factual and honest; gracefully decline harmful requests."
].join("\n");

export const intentSystemPromptBase = [
  "You are Bernard's intent router. Your job is to pick the next tool calls.",
  "Only respond with tool_calls using the provided tools. Arguments must be valid JSON objects.",
  "Use the minimum tool calls needed. If you have enough info to finalize, call respond with empty {} arguments.",
  "You may call multiple tools in a single message. These will execute in parallel.",
  "Do not write conversational text or analysis; just emit one or more parallel tool_calls."
].join("\n");

function formatWithSystemTimezone(now: Date = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return `${formatter.format(now)} (${timeZone})`;
}

export function buildSystemPrompts(now: Date = new Date()) {
  const currentDateTime = `Current date/time: ${formatWithSystemTimezone(now)}`;
  return {
    bernardSystemPrompt: [bernardSystemPromptBase, currentDateTime].join("\n"),
    intentSystemPrompt: [intentSystemPromptBase, currentDateTime].join("\n")
  };
}

