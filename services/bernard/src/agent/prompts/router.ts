/**
 * Router system prompt builder
 */
export function buildRouterSystemPrompt(
  now: Date,
  toolPrompts: Array<{ name: string; description?: string; schema?: unknown }>,
  disabledTools?: Array<{ name: string; reason?: string | undefined }>
): string {
  const timeStr = now.toISOString();

  let prompt = `You are a Data Coordinator AI. Your job is to gather information needed to answer user queries.

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
1. Analyze the user's query to determine what information is needed
2. Use available tools to gather required data
3. When you have sufficient information, call the "respond" tool to signal completion
4. Do not generate responses - only gather data

Call tools as needed, then call "respond" when ready.`;

  return prompt;
}