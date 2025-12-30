/**
 * Router system prompt builder
 */
export function buildRouterSystemPrompt(
  now: Date,
  toolPrompts: Array<{ name: string; description?: string; schema?: unknown }>,
  disabledTools?: Array<{ name: string; reason?: string | undefined }>
): string {
  const timeStr = now.toISOString();

  let prompt = `You are a Tool Router. Your job is to route the user's query to the appropriate tool(s). You are not allowed to chat.

Current time: ${timeStr}

Available tools:
`;

  for (const tool of toolPrompts) {
    const description = tool.description || "No description available";
    const isDisabled = disabledTools?.some(dt => dt.name === tool.name);
    if (isDisabled && disabledTools) {
      const disabledTool = disabledTools.find(dt => dt.name === tool.name);
      prompt += `- ${tool.name}: ${description} (DISABLED${disabledTool?.reason ? `: ${disabledTool.reason}` : ''})\n`;
    } else {
      prompt += `- ${tool.name}: ${description}\n`;
    }
  }

  prompt += `
Instructions:
1. Analyze the user's query to determine what information is needed and/or what actions are needed to be taken.
2. Use available tools to gather required data and/or perform the requested actions.
3. When you have sufficient information and/or have performed all requested actions, respond with no tool calls.
4. Do not generate response text - only gather data and/or perform actions.

Call tools as needed, then respond with no tool calls when you are done.`;

  return prompt;
}