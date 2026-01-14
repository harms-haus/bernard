import { useState, useEffect, FormEvent, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Checkpoint } from '@langchain/langgraph-sdk';
import { getAPIClient } from '@/lib/api/client';
import { ensureToolCallsHaveResponses } from '@/lib/ensure-tool-responses';

// Type definitions for dependency injection
export interface UseThreadDataDependencies {
  useSearchParams: () => [URLSearchParams, (params: URLSearchParams) => void];
  useStreamContext: () => StreamContextType;
  useDarkMode: () => DarkModeContextType;
  useThreads: () => ThreadContextType;
}

export interface StreamContextType {
  messages: Message[];
  submit: (values: { messages: Message[] }, options?: {
    streamMode?: string[];
    optimisticValues?: (prev: any) => any;
    checkpoint?: Checkpoint;
  }) => void;
  isLoading: boolean;
  latestProgress: ToolProgressEvent | null;
}

export interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export interface ThreadContextType {
  getThreads: () => Promise<void>;
}

export interface ToolProgressEvent {
  type: 'progress' | 'step' | 'complete' | 'error';
  tool: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface ThreadData {
  threadId: string | null;
  messages: Message[];
  isLoading: boolean;
  isDarkMode: boolean;
  latestProgress: ToolProgressEvent | null;
  input: string;
  isGhostMode: boolean;
  chatStarted: boolean;
  setInput: (value: string) => void;
  setIsGhostMode: (value: boolean) => void;
  handleSubmit: (e: FormEvent) => void;
  handleNewChat: () => void;
  handleRegenerate: (parentCheckpoint: Checkpoint | null | undefined) => void;
  handleCopyChatHistory: () => Promise<void>;
  handleDownloadChatHistory: () => void;
  toggleDarkMode: () => void;
}

export function useThreadData(
  deps: Partial<UseThreadDataDependencies> = {}
): ThreadData {
  const {
    useSearchParams: useSearchParamsImpl = () => useSearchParams(),
    useStreamContext: useStreamContextImpl = () => {
      const mod = require('@/providers/StreamProvider');
      return mod.useStreamContext();
    },
    useDarkMode: useDarkModeImpl = () => {
      const mod = require('@/hooks/useDarkMode');
      return mod.useDarkMode();
    },
    useThreads: useThreadsImpl = () => {
      const mod = require('@/providers/ThreadProvider');
      return mod.useThreads();
    },
  } = deps;

  const [searchParams, setSearchParams] = useSearchParamsImpl();
  const threadId = searchParams.get('threadId');

  const stream = useStreamContextImpl();
  const { messages, submit, isLoading, latestProgress } = stream;
  const { isDarkMode: darkModeValue, toggleDarkMode: toggleDarkModeFn } = useDarkModeImpl();
  const { getThreads } = useThreadsImpl();

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
      const firstHumanMessage = messages.find((m: Message) => m.type === 'human');
      if (firstHumanMessage) {
        const messageContent = typeof firstHumanMessage.content === 'string'
          ? firstHumanMessage.content
          : JSON.stringify(firstHumanMessage.content);

        const apiClient = getAPIClient();
        apiClient.autoRenameThread(threadId, messageContent)
          .then(() => {
            getThreads();
            setHasTriggeredAutoRename(true);
          })
          .catch((error) => {
            console.error('Failed to auto-rename thread:', error);
          });
      }
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
        streamMode: ['values'],
        optimisticValues: (prev: any) => ({
          ...prev,
          messages: [...(prev.messages ?? []), ...toolMessages, newHumanMessage],
        }),
      }
    );
    setInput('');
  }, [input, isLoading, messages, submit]);

  const handleNewChat = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const handleRegenerate = useCallback((parentCheckpoint: Checkpoint | null | undefined) => {
    stream.submit(undefined, { checkpoint: parentCheckpoint, streamMode: ['values'] });
  }, [stream]);

  const handleCopyChatHistory = useCallback(async () => {
    const historyData = messages.map((msg: Message) => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(historyData, null, 2));
    } catch (err) {
      console.error('Failed to copy chat history:', err);
      // Consider showing a user-facing error notification
    }
  }, [messages]);

  const handleDownloadChatHistory = useCallback(() => {
    const historyData = messages.map((msg: Message) => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bernard-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  return {
    threadId,
    messages,
    isLoading,
    isDarkMode: darkModeValue,
    latestProgress,
    input,
    isGhostMode,
    chatStarted: messages.length > 0,
    setInput,
    setIsGhostMode,
    handleSubmit,
    handleNewChat,
    handleRegenerate,
    handleCopyChatHistory,
    handleDownloadChatHistory,
    toggleDarkMode: toggleDarkModeFn,
  };
}
