import type { Message } from '@langchain/langgraph-sdk';

interface ToolMessage {
  type: 'tool';
  content: string;
  tool_call_id: string;
}

export interface UseAssistantMessageDataDependencies {
  useStreamContext: () => ReturnType<typeof import('@/providers/StreamProvider').useStreamContext>;
}

export interface AssistantMessageData {
  toolResults: ToolMessage[];
  hasToolCalls: boolean;
  toolCallsHaveContents: boolean;
  contentString: string;
  isToolResult: boolean;
}

export function useAssistantMessageData(
  message: Message,
  nextMessages: Message[] = [],
  _deps: Partial<UseAssistantMessageDataDependencies> = {}
): AssistantMessageData {
  function getContentString(content: Message['content']): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(part => part.type === 'text').map(part => (part as { text?: string }).text).filter(Boolean).join('\n');
    }
    return JSON.stringify(content);
  }

  const contentString = getContentString(message.content);

  const isToolResult = message.type === 'tool';
  const hasToolCalls = 'tool_calls' in message && Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  const toolCallsHaveContents = hasToolCalls && (message.tool_calls?.some((tc) => {
    // LangChain stores arguments as a string in tc.function.arguments
    const args = (tc as any).function?.arguments;
    if (typeof args !== 'string') return false;
    try {
      const parsed = JSON.parse(args);
      return parsed !== null && typeof parsed === 'object' && Object.keys(parsed).length > 0;
    } catch {
      return args.trim().length > 0;
    }
  }) ?? false);

  const toolResults = hasToolCalls
    ? (nextMessages.filter((m) => m.type === 'tool' && message.tool_calls?.some((tc) => tc.id === m.tool_call_id)) as ToolMessage[])
    : [];

  return {
    toolResults,
    hasToolCalls,
    toolCallsHaveContents,
    contentString,
    isToolResult,
  };
}
