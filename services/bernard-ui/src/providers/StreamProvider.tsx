import { useStream } from '@langchain/langgraph-sdk/react';
import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useThreads } from './ThreadProvider';

// Re-export types from SDK for convenience
export type { Message, AIMessage, ToolMessage, HumanMessage } from '@langchain/langgraph-sdk';

interface StreamContextType {
  messages: ReturnType<typeof useStream>['messages'];
  submit: ReturnType<typeof useStream>['submit'];
  isLoading: ReturnType<typeof useStream>['isLoading'];
  error: ReturnType<typeof useStream>['error'];
  stop: ReturnType<typeof useStream>['stop'];
  values: ReturnType<typeof useStream>;
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

  const streamValue = useStream(options);

  return (
    <StreamContext.Provider
      value={{
        messages: streamValue.messages,
        submit: streamValue.submit,
        isLoading: streamValue.isLoading,
        error: streamValue.error,
        stop: streamValue.stop,
        values: streamValue,
      }}
    >
      {children}
    </StreamContext.Provider>
  );
}

export { StreamContext as default };
