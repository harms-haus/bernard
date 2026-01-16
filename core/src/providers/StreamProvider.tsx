import { useStream, type UseStream } from '@langchain/langgraph-sdk/react';
import { createContext, useContext, ReactNode, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useThreads } from './ThreadProvider';
import { type Message } from '@langchain/langgraph-sdk';

// Re-export types from SDK for convenience
export type { Message, AIMessage, ToolMessage, HumanMessage } from '@langchain/langgraph-sdk';

export type StateType = { messages: Message[] };

export type StreamBag = {
  UpdateType: {
    messages?: Message[] | Message | string;
  };
};

type StreamContextType = UseStream<StateType, StreamBag>;

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

interface ExtendedStreamContextType extends StreamContextType {
  latestProgress: ToolProgressEvent | null;
  resetProgress: () => void;
}

const StreamContext = createContext<ExtendedStreamContextType | undefined>(undefined);

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

export function StreamProvider({ children, apiUrl, assistantId, threadId }: StreamProviderProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { createThread } = useThreads();

  const latestProgressRef = useRef<ToolProgressEvent | null>(null);
  const [latestProgress, setLatestProgress] = useState<ToolProgressEvent | null>(null);

  // Callback to reset progress when a new message arrives
  const resetProgress = useCallback(() => {
    latestProgressRef.current = null;
    setLatestProgress(null);
  }, []);

  const options = useMemo(() => ({
    apiUrl,
    assistantId,
    threadId: threadId ?? null,
    fetchStateHistory: true,
    onCustomEvent: (event: unknown) => {
      const customEvent = event as { _type?: string; tool?: string; phase?: string; message?: string; data?: Record<string, unknown>; timestamp?: number };
      if (customEvent._type === 'tool_progress') {
        // Hide progress indicator on complete phase
        if (customEvent.phase === 'complete') {
          latestProgressRef.current = null;
          setLatestProgress(null);
          return;
        }
        const progressEvent: ToolProgressEvent = {
          type: (customEvent.phase as ToolProgressEvent['type']) || 'progress',
          tool: customEvent.tool || 'unknown',
          message: customEvent.message || '',
          data: customEvent.data,
          timestamp: customEvent.timestamp || Date.now(),
        };
        latestProgressRef.current = progressEvent;
        setLatestProgress(progressEvent);
      }
    },
    onThreadId: (id: string) => {
      if (id && id !== threadId) {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('threadId', id);
        router.replace(`/bernard/chat?${newParams.toString()}`);

        createThread(id);
      }
    },
  }), [apiUrl, assistantId, threadId, searchParams, router, createThread]);

  const streamValue = useStream<StateType, StreamBag>(options);

  // Extend the context value to include progress functionality
  const contextValue: ExtendedStreamContextType = {
    ...streamValue,
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
