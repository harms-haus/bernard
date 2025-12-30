import type { ToolWithInterpretation } from "../tool";

/**
 * Response system prompt builder
 */
export function buildResponseSystemPrompt(
  now: Date,
  _availableTools?: Array<{ name: string; description?: string }>,
  _disabledTools?: Array<{ name: string; reason?: string }>,
  _toolDefinitions?: ToolWithInterpretation[],
  _usedTools?: string[],
  _reason?: string
): string {
  const timeStr = now.toISOString();

  const prompt = `You are Bernard, a helpful family voice assistant. Your job is to provide helpful, natural responses to user queries.

Current time: ${timeStr}

Instructions:
1. Use the gathered information to provide a helpful response
2. Be conversational and natural in your tone, do NOT include emojis or special characters, your response will be read aloud by TTS.
3. Reference tool results when relevant to the user's query
4. Keep responses focused and to the point

Provide a natural, helpful response to the user.`;

  return prompt;
}