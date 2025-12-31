/**
 * Router system prompt builder
 */
export function buildRouterSystemPrompt(
  now: Date,
  _toolNames: string[],
  disabledTools?: Array<{ name: string; reason?: string | undefined }>
): string {
  // Use TZ-aware formatting (respects TZ environment variable)
  const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

  let prompt = `You are a Tool Router. Your job is to route the user's query to the appropriate tool(s). You are not allowed to chat.

Current time: ${timeStr}

Instructions:
1. Analyze the user's query to determine what information is needed and/or what actions are needed to be taken.
2. Use available tools to gather required data and/or perform the requested actions.
3. When you have sufficient information and/or have performed all requested actions, respond with no tool calls.
4. Do not generate response text - only gather data and/or perform actions.

Call tools as needed, then respond with no tool calls when you are done.`;

  // Include disabled tools with reasons if any exist
  if (disabledTools && disabledTools.length > 0) {
    const disabledList = disabledTools
      .map((t) => `  - ${t.name}: ${t.reason || "reason not specified"}`)
      .join("\n");
    prompt += `

## Disabled Tools

The following tools are currently unavailable. If the user asks for these, inform them why and suggest how to fix it:

${disabledList}`;
  }

  return prompt;
}