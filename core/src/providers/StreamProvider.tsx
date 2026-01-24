import React, { createContext, useContext, ReactNode, useState } from 'react';
import { useStream } from '@langchain/langgraph-sdk/react';
import { type Message } from '@langchain/langgraph-sdk';
import {
  uiMessageReducer,
  type UIMessage,
  type RemoveUIMessage,
} from '@langchain/langgraph-sdk/react-ui';

export type StateType = { messages: Message[]; ui?: UIMessage[] };

export interface ToolProgressEvent {
  _type: 'tool_progress';
  tool: string;
  phase: 'step' | 'complete';
  message: string;
  timestamp: number;
}

type StreamContextType = ReturnType<typeof useStream<StateType, {
  UpdateType: {
    messages?: Message[] | Message | string;
    ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
  };
  CustomEventType: UIMessage | RemoveUIMessage;
}>> & {
  latestProgress: ToolProgressEvent | null;
};
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
  const [latestProgress, setLatestProgress] = useState<ToolProgressEvent | null>(null);

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
      const eventData = event as unknown as Record<string, unknown>;
      // Handle tool_progress custom events
      if (eventData._type === 'tool_progress') {
        const phase = eventData.phase;
        if (phase === 'step' || phase === 'complete') {
          // Validate required fields before creating progress event
          if (
            typeof eventData.tool === 'string' &&
            eventData.tool.length > 0 &&
            typeof eventData.message === 'string' &&
            eventData.timestamp !== undefined &&
            Number.isFinite(Number(eventData.timestamp))
          ) {
            const progressEvent: ToolProgressEvent = {
              _type: 'tool_progress',
              tool: eventData.tool,
              phase: phase,
              message: eventData.message,
              timestamp: Number(eventData.timestamp),
            };
            setLatestProgress(progressEvent);
            return;
          }
          // Skip invalid progress events (optionally log warning in development)
          if (process.env.NODE_ENV === 'development') {
            console.warn('Invalid tool_progress event data:', eventData);
          }
        }
      }
      // Handle UI messages
      options.mutate((prev) => {
        const ui = uiMessageReducer(prev.ui ?? [], event);
        return { ...prev, ui };
      });
    },
  });

  return (
    <StreamContext.Provider value={{ ...streamValue, latestProgress } as StreamContextType}>
      {children}
    </StreamContext.Provider>
  );
}


export default StreamContext;
