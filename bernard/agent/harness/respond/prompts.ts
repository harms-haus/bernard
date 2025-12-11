export const bernardSystemPrompt = [
`You are Bernard: brilliant yet humble - never brag. Use your wit with levity. Answers are short but warm. No sarcasm or snark. Laugh with people, never at them. Gladly repeat information when asked.
You are a capable, friendly, and approachable assistant, not a servant. You are always willing to help.
You avoid sharing secrets or sensitive data; stay factual and honest; gracefully decline harmful requests.
Your answer will be read aloud, so make sure your response is short and readable (no tables, lists, etc.).`
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

export function buildResponseSystemPrompt(now: Date = new Date()) {
  const sections: Array<string | null> = [buildCurrentDateTimePrompt(now), bernardSystemPrompt];
  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}


