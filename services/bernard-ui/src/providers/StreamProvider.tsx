import { useStream } from '@langchain/langgraph-sdk/react';
import { createContext, useContext, ReactNode, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useThreads } from './ThreadProvider';
import { type Message } from '@langchain/langgraph-sdk';

// Re-export types from SDK for convenience
export type { Message, AIMessage, ToolMessage, HumanMessage } from '@langchain/langgraph-sdk';

export type StateType = { messages: Message[] };

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
    };
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream>;

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
  const [, setSearchParams] = useSearchParams();
  const { createThread } = useThreads();

  // Store the latest progress event for UI display
  const latestProgressRef = useRef<ToolProgressEvent | null>(null);

  // Callback to reset progress when a new message arrives
  const resetProgress = useCallback(() => {
    latestProgressRef.current = null;
  }, []);

  const options = useMemo(() => ({
    apiUrl,
    assistantId,
    threadId: threadId ?? null,
    onCustomEvent: (event: unknown) => {
      // Capture progress events from the backend
      const customEvent = event as { _type?: string; tool?: string; phase?: string; message?: string; data?: Record<string, unknown>; timestamp?: number };
      if (customEvent._type === 'tool_progress') {
        latestProgressRef.current = {
          type: (customEvent.phase as ToolProgressEvent['type']) || 'progress',
          tool: customEvent.tool || 'unknown',
          message: customEvent.message || '',
          data: customEvent.data,
          timestamp: customEvent.timestamp || Date.now(),
        };
      }
    },
    onThreadId: (id: string) => {
      if (id && id !== threadId) {
        setSearchParams((prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.set('threadId', id);
          return newParams;
        }, { replace: true });
        
        createThread(id);
      }
    },
  }), [apiUrl, assistantId, threadId, setSearchParams, createThread]);

  const streamValue = useTypedStream(options);

  // Extend the context value to include progress functionality
  const contextValue: ExtendedStreamContextType = {
    ...streamValue,
    get latestProgress() {
      return latestProgressRef.current;
    },
    resetProgress,
  };

  return (
    <StreamContext.Provider value={contextValue}>
      {children}
    </StreamContext.Provider>
  );
}

export { StreamContext as default };
