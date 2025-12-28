import type { ToolWithInterpretation } from "../tool";

/**
 * Response system prompt builder
 */
export function buildResponseSystemPrompt(
  now: Date,
  availableTools?: Array<{ name: string; description?: string }>,
  disabledTools?: Array<{ name: string; reason?: string }>,
  toolDefinitions?: ToolWithInterpretation[],
  usedTools?: string[],
  reason?: string
): string {
  const timeStr = now.toISOString();

  let prompt = `You are a Creative Assistant AI. Your job is to provide helpful, natural responses to user queries.

Current time: ${timeStr}

`;

  if (toolDefinitions && toolDefinitions.length > 0) {
    prompt += `Tools that were used to gather information:\n`;
    for (const tool of toolDefinitions) {
      if (usedTools?.includes(tool.name)) {
        prompt += `- ${tool.name}: ${tool.description}\n`;
        if (tool.interpretationPrompt) {
          prompt += `  Interpretation: ${tool.interpretationPrompt}\n`;
        }
      }
    }
    prompt += `\n`;
  }

  if (reason) {
    prompt += `Response reason: ${reason}\n\n`;
  }

  prompt += `Instructions:
1. Use the gathered information to provide a helpful response
2. Be conversational and natural in your tone
3. Reference tool results when relevant to the user's query
4. Keep responses focused and to the point

Provide a natural, helpful response to the user.`;

  return prompt;
}