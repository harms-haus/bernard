import React, { createContext, useContext, ReactNode } from 'react';
import { useStream } from '@langchain/langgraph-sdk/react';
import { type Message } from '@langchain/langgraph-sdk';
import {
  uiMessageReducer,
  type UIMessage,
  type RemoveUIMessage,
} from '@langchain/langgraph-sdk/react-ui';

export type StateType = { messages: Message[]; ui?: UIMessage[] };

type StreamContextType = ReturnType<typeof useStream<StateType, {
  UpdateType: {
    messages?: Message[] | Message | string;
    ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
  };
  CustomEventType: UIMessage | RemoveUIMessage;
}>>;
const StreamContext = createContext<StreamContextType | undefined>(undefined);

export function useStreamContext(): StreamContextType {
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
  const streamValue = useStream<StateType, {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }>({
    apiUrl,
    assistantId,
    threadId: threadId ?? null,
    onCustomEvent: (event, options) => {
      options.mutate((prev) => {
        const ui = uiMessageReducer(prev.ui ?? [], event);
        return { ...prev, ui };
      });
    },
  });

  return (
    <StreamContext.Provider value={streamValue}>
      {children}
    </StreamContext.Provider>
  );
}

export default StreamContext;
