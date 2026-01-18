import { useEffect, useRef, useCallback } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { getAPIClient } from '@/lib/api/client';
import type { IAPIClient } from '@/lib/api/types';

interface UseAutoRenameOptions {
  threadId: string | null;
  messages: Message[];
  onRenameComplete?: () => void;
  apiClient?: IAPIClient;
}

interface UseAutoRenameResult {
  hasTriggeredAutoRename: boolean;
  triggerAutoRename: () => void;
  isAutoRenaming: boolean;
}

export function useAutoRename({
  threadId,
  messages,
  onRenameComplete,
  apiClient = getAPIClient(),
}: UseAutoRenameOptions): UseAutoRenameResult {
  const hasTriggeredRef = useRef(new Set<string>());
  const isRenamingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!threadId) return;
    // Reset when thread changes
    hasTriggeredRef.current.delete(threadId);
    isRenamingRef.current.delete(threadId);
  }, [threadId]);

  const performAutoRename = useCallback((currentThreadId: string, currentMessages: Message[]) => {
    if (isRenamingRef.current.has(currentThreadId)) return;
    if (hasTriggeredRef.current.has(currentThreadId)) return;
    if (currentMessages.length !== 2) return;

    const firstHumanMessage = currentMessages.find(m => m.type === 'human');
    if (!firstHumanMessage) return;

    const messageContent = typeof firstHumanMessage.content === 'string'
      ? firstHumanMessage.content
      : JSON.stringify(firstHumanMessage.content);

    isRenamingRef.current.add(currentThreadId);

    apiClient.autoRenameThread(currentThreadId, messageContent)
      .then(() => {
        hasTriggeredRef.current.add(currentThreadId);
        onRenameComplete?.();
      })
      .catch((err) => {
        console.error('Auto-rename failed:', err);
      })
      .finally(() => {
        isRenamingRef.current.delete(currentThreadId);
      });
  }, [apiClient, onRenameComplete]);

  useEffect(() => {
    if (!threadId) return;
    performAutoRename(threadId, messages);
  }, [threadId, messages, messages.length, performAutoRename]);

  return {
    hasTriggeredAutoRename: threadId ? hasTriggeredRef.current.has(threadId) : false,
    triggerAutoRename: () => threadId && performAutoRename(threadId, messages),
    isAutoRenaming: threadId ? isRenamingRef.current.has(threadId) : false,
  };
}
