import { useState, useEffect, FormEvent, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@langchain/langgraph-sdk';
import { getAPIClient } from '@/lib/api/client';
import { ensureToolCallsHaveResponses } from '@/lib/ensure-tool-responses';
import { useStreamContext } from '@/providers/StreamProvider';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useThreads } from '@/providers/ThreadProvider';

export interface ThreadData {
  threadId: string | null;
  messages: Message[];
  isLoading: boolean;
  isDarkMode: boolean;
  input: string;
  isGhostMode: boolean;
  chatStarted: boolean;
  setInput: (value: string) => void;
  setIsGhostMode: (value: boolean) => void;
  handleSubmit: (e: FormEvent) => void;
  handleNewChat: () => void;
  handleCopyChatHistory: () => Promise<void>;
  handleDownloadChatHistory: () => void;
  toggleDarkMode: () => void;
}

export function useThreadData(): ThreadData {
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get('threadId');

  const stream = useStreamContext();
  const { messages, submit, isLoading } = stream;
  const { isDarkMode: darkModeValue, toggleDarkMode: toggleDarkModeFn } = useDarkMode();
  const { getThreads } = useThreads();

  const [input, setInput] = useState('');
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [hasTriggeredAutoRename, setHasTriggeredAutoRename] = useState(false);

  useEffect(() => {
    setInput('');
  }, [threadId]);

  useEffect(() => {
    setHasTriggeredAutoRename(false);
  }, [threadId]);

  useEffect(() => {
    if (threadId && !hasTriggeredAutoRename && messages.length === 2) {
      let isActive = true;
      const apiClient = getAPIClient();
      apiClient.autoRenameThread(threadId)
        .then(() => {
          if (isActive) {
            getThreads();
            setHasTriggeredAutoRename(true);
          }
        })
        .catch((error) => {
          console.error('Failed to auto-rename thread:', error);
          if (isActive) {
            setHasTriggeredAutoRename(true);
          }
        });
      
      return () => {
        isActive = false;
      };
    }
  }, [messages, hasTriggeredAutoRename, threadId, getThreads]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: 'human',
      content: input.trim(),
    };

    const toolMessages = ensureToolCallsHaveResponses(messages);
    submit(
      { messages: [...toolMessages, newHumanMessage] },
      {
        optimisticValues: (prev: any) => ({
          ...prev,
          messages: [...(prev.messages ?? []), ...toolMessages, newHumanMessage],
        }),
      }
    );
    setInput('');
  }, [input, isLoading, messages, submit]);

  const handleNewChat = useCallback(() => {
    router.replace('/bernard/chat');
  }, [router]);

  const handleCopyChatHistory = useCallback(async () => {
    const historyData = messages.map((msg: Message) => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(historyData, null, 2));
    } catch (error) {
      console.error('Failed to copy chat history:', error);
    }
  }, [messages]);

  const handleDownloadChatHistory = useCallback(() => {
    const historyData = messages.map((msg: Message) => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-history-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages]);

  const toggleDarkMode = useCallback(() => {
    toggleDarkModeFn();
  }, [toggleDarkModeFn]);

  return {
    threadId,
    messages,
    isLoading,
    isDarkMode: darkModeValue,
    input,
    isGhostMode,
    chatStarted: messages.length > 0,
    setInput,
    setIsGhostMode,
    handleSubmit,
    handleNewChat,
    handleCopyChatHistory,
    handleDownloadChatHistory,
    toggleDarkMode,
  };
}
