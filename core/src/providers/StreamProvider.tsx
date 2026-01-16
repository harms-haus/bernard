import { createContext, useContext, ReactNode, useRef, useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useThreads } from './ThreadProvider';
import type { Message } from '@langchain/langgraph-sdk';

// Re-export types from SDK for convenience
export type { Message, AIMessage, ToolMessage, HumanMessage } from '@langchain/langgraph-sdk';

export type StateType = { messages: Message[] };

/**
 * Progress event structure received from custom stream events
 */
export interface ToolProgressEvent {
  type: 'progress' | 'step' | 'complete' | 'error';
  tool: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface StreamContextType {
  messages: Message[];
  submit: (input: { messages: Message[] }, options?: {
    streamMode?: string[];
    optimisticValues?: (prev: StateType) => StateType;
    checkpoint?: unknown;
  }) => void;
  isLoading: boolean;
  stop: () => void;
  error: Error | null;
  latestProgress: ToolProgressEvent | null;
  resetProgress: () => void;
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

export function useStreamContext() {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error('useStreamContext must be used within a StreamProvider');
  }
  return context;
}

interface StreamProviderProps {
  children: ReactNode;
  apiUrl: string;
  assistantId: string;
  threadId?: string | null;
}

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

function parseSSE(data: string): ChatCompletionChunk | null {
  if (data.trim() === '[DONE]') {
    return null;
  }
  try {
    return JSON.parse(data) as ChatCompletionChunk;
  } catch {
    return null;
  }
}

function convertToLangGraphMessage(chunk: ChatCompletionChunk, role: string): Message | null {
  const choice = chunk.choices[0];
  if (!choice) return null;

  const content = choice.delta.content;
  const toolCalls = choice.delta.tool_calls;

  if (content) {
    return {
      id: chunk.id,
      type: role === 'user' ? 'human' : 'ai',
      content: content,
    };
  }

  if (toolCalls && toolCalls.length > 0) {
    return {
      id: chunk.id,
      type: 'ai',
      content: `[tool_calls]${JSON.stringify(toolCalls)}[/tool_calls]`,
    };
  }

  return null;
}

export function StreamProvider({ children, apiUrl, threadId }: StreamProviderProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { createThread } = useThreads();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [latestProgress, setLatestProgress] = useState<ToolProgressEvent | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const latestProgressRef = useRef<ToolProgressEvent | null>(null);

  // Reset progress when a new message arrives
  const resetProgress = useCallback(() => {
    latestProgressRef.current = null;
    setLatestProgress(null);
  }, []);

  // Handle incoming tool progress events from the stream
  const handleToolProgress = (line: string) => {
    if (line.startsWith('event: tool_progress')) {
      try {
        const data = line.replace('event: tool_progress\ndata: ', '');
        const event = JSON.parse(data) as ToolProgressEvent;
        latestProgressRef.current = event;
        setLatestProgress(event);
      } catch {
        // Ignore parse errors
      }
    }
  };

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const submit = useCallback(async (input: { messages: Message[] } | undefined, _options?: {
    streamMode?: string[];
    optimisticValues?: (prev: StateType) => StateType;
    checkpoint?: unknown;
  }) => {
    stop();
    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // For regeneration (undefined input), use existing messages
      const messagesToUse = input?.messages ?? messages;

      // Convert messages to OpenAI format
      const openAIMessages = messagesToUse.map(msg => ({
        role: msg.type === 'human' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      }));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'bernard-v1',
          messages: openAIMessages,
          stream: true,
          thread_id: threadId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Initialize assistant message
      let currentMessage: Message = {
        id: '',
        type: 'ai',
        content: '',
      };

      while (true) {
        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          // Handle tool progress events
          if (line.startsWith('event: ')) {
            handleToolProgress(line);
            continue;
          }

          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          const chunk = parseSSE(data);
          if (!chunk) continue;

          // Handle thread creation/update
          if (chunk.id && !currentMessage.id) {
            currentMessage.id = chunk.id;
          }

          // Update message content
          const newContent = convertToLangGraphMessage(chunk, 'assistant');
          if (newContent) {
            currentMessage = {
              ...currentMessage,
              content: (currentMessage.content as string) + (newContent.content as string),
            };
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.id === currentMessage.id) {
                const updated = [...prev];
                updated[updated.length - 1] = currentMessage;
                return updated;
              }
              return [...prev, currentMessage];
            });
          }
        }
      }

      // Get thread ID from response headers if available
      const threadIdHeader = response.headers.get('x-thread-id');
      if (threadIdHeader && threadIdHeader !== threadId) {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('threadId', threadIdHeader);
        router.replace(`/bernard/chat?${newParams.toString()}`);
        createThread(threadIdHeader);
      }

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err as Error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [apiUrl, threadId, searchParams, router, createThread, stop]);

  // Fetch initial state if threadId is provided
  useEffect(() => {
    if (threadId) {
      // Could fetch thread history here if needed
      setMessages([]);
    }
  }, [threadId]);

  const contextValue: StreamContextType = {
    messages,
    submit,
    isLoading,
    stop,
    error,
    latestProgress,
    resetProgress,
  };

  return (
    <StreamContext.Provider value={contextValue}>
      {children}
    </StreamContext.Provider>
  );
}

export { StreamContext as default };
