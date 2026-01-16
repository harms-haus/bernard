import type { Message } from '@langchain/langgraph-sdk';
import { useStreamContext } from '@/providers/StreamProvider';

interface ToolMessage {
  type: 'tool';
  content: string;
  tool_call_id: string;
}

export interface UseAssistantMessageDataDependencies {
  useStreamContext: () => ReturnType<typeof import('@/providers/StreamProvider').useStreamContext>;
}

export interface AssistantMessageData {
  meta: {
    branch?: string;
    branchOptions?: string[];
    parentCheckpoint?: unknown;
  };
  hasBranches: boolean;
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
  const thread = useStreamContext();
  
  function getContentString(content: Message['content']): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(part => part.type === 'text').map(part => (part as { text?: string }).text).filter(Boolean).join('\n');
    }
    return JSON.stringify(content);
  }

  const contentString = getContentString(message.content);
  const meta = thread.getMessagesMetadata(message);
  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
  const hasBranches = (meta?.branchOptions?.length ?? 0) > 1;

  const isToolResult = message.type === 'tool';
  const hasToolCalls = 'tool_calls' in message && Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  const toolCallsHaveContents = hasToolCalls && (message.tool_calls?.some((tc) => tc.args && Object.keys(tc.args).length > 0) ?? false);

  const toolResults = hasToolCalls
    ? (nextMessages.filter((m) => m.type === 'tool' && message.tool_calls?.some((tc) => tc.id === m.tool_call_id)) as ToolMessage[])
    : [];

  return {
    meta: {
      branch: meta?.branch,
      branchOptions: meta?.branchOptions,
      parentCheckpoint,
    },
    hasBranches,
    toolResults,
    hasToolCalls,
    toolCallsHaveContents,
    contentString,
    isToolResult,
  };
}
