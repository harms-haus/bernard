import { useStream } from '@langchain/langgraph-sdk/react';
import { createContext, useContext, ReactNode, useMemo } from 'react';
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

export function StreamProvider({ children, apiUrl, assistantId, threadId }: StreamProviderProps) {
  const [, setSearchParams] = useSearchParams();
  const { createThread } = useThreads();

  const options = useMemo(() => ({
    apiUrl,
    assistantId,
    threadId: threadId ?? null,
    onCustomEvent: () => {},
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

  const contextValue: StreamContextType = streamValue;

  return (
    <StreamContext.Provider value={contextValue}>
      {children}
    </StreamContext.Provider>
  );
}

export { StreamContext as default };
