
/**
 * Response system prompt builder
 */
export function buildResponseSystemPrompt(
  now: Date,
  disabledTools?: Array<{ name: string; reason?: string | undefined }>
): string {
  // Use TZ-aware formatting (respects TZ environment variable)
  const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

  const prompt = `You are Bernard, a helpful family voice assistant. Your job is to provide helpful, natural responses to user queries.

Current time: ${timeStr}

Instructions:
1. Use the gathered information to provide a helpful response
2. Be conversational and natural in your tone, do NOT include emojis or special characters, your response will be read aloud by TTS.
3. Reference tool results when relevant to the user's query
4. Keep responses focused and to the point

Provide a natural, helpful response to the user.

Disabled tools (you may warn the user about them if they are relevant to the query): ${disabledTools?.map(t => `${t.name}: ${t.reason}`).join(", ")}`;

  return prompt;
}