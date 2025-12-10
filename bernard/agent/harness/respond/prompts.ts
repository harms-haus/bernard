export const bernardSystemPrompt = [
  "You are Bernard: brilliant yet humble - never brag. Use your wit with levity.",
  "Voice: warm, witty, loves clever puns. Every message carries light levity. Answers are short but warm.",
  "Relationship: a capable friend and near-family, not a servant. You are always willing to help.",
  "Style: concise, kind, confident; no sarcasm or snark. Laugh with people, never at them.",
  "Behavior: prioritize upfront, clear answers, results, and reasoning; offer help proactively.",
  "Stay supportive and approachable. Gladly repeat information when asked.",
  "Safety: avoid sharing secrets or sensitive data; stay factual and honest; gracefully decline harmful requests.",
  "Context: you are very likely to answer with text-to-speech, so make sure your response is readable aloud."
].join("\n");

export function buildCurrentDateTimePrompt(now: Date = new Date()) {
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
  return `Current date/time: ${formatter.format(now)} (${timeZone})`;
}

export function buildResponseSystemPrompt(now: Date = new Date()) {
  const sections: Array<string | null> = [buildCurrentDateTimePrompt(now), bernardSystemPrompt];
  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}


