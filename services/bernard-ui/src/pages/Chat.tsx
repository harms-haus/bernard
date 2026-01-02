import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChatInterface, TraceEvent } from '../components/ChatInterface';
import { apiClient } from '../services/api';
import type { MessageRecord } from '../../../bernard/lib/conversation/types';
import { useToast } from '../components/ToastManager';

export function Chat() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const [initialMessages, setInitialMessages] = useState<MessageRecord[]>([]);
  const [initialTraceEvents, setInitialTraceEvents] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(!!conversationId);
  const toast = useToast();

  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    const loadConversation = async () => {
      try {
        const response = await apiClient.getConversation(conversationId);
        
        // Convert events to MessageRecord format
        const messages: MessageRecord[] = response.events
          .filter((event) => {
            // Filter out events that aren't meant to be displayed as regular messages
            if (event.type === 'llm_call' || event.type === 'tool_call') {
              return false;
            }
            return true;
          })
          .map((event) => {
            const messageRecord: MessageRecord = {
              id: event.id,
              role: mapEventTypeToRole(event.type),
              content: extractContent(event),
              createdAt: event.timestamp,
              metadata: event.data as Record<string, unknown>,
            };

            // Handle tool responses
            if (event.type === 'tool_response' && event.data) {
              const data = event.data as Record<string, unknown>;
              if (data.tool_call_id) {
                messageRecord.tool_call_id = data.tool_call_id as string;
              }
              if (data.tool_name) {
                messageRecord.name = data.tool_name as string;
              }
            }

            // Handle LLM responses with tool calls
            if (event.type === 'llm_response' && event.data) {
              const data = event.data as Record<string, unknown>;
              if (data.tool_calls) {
                messageRecord.tool_calls = data.tool_calls as unknown[];
              }
            }

            return messageRecord;
          });

        // Convert events to TraceEvent format for tool calls and LLM calls
        const traceEvents: TraceEvent[] = response.events
          .filter((event) => event.type === 'llm_call' || event.type === 'tool_call')
          .map((event) => ({
            id: event.id,
            type: event.type === 'llm_call' ? 'llm_call' as const : 'tool_call' as const,
            data: event.data,
            timestamp: new Date(event.timestamp),
            status: 'completed' as const,
          }));

        setInitialMessages(messages);
        setInitialTraceEvents(traceEvents);
      } catch (error) {
        console.error('Failed to load conversation:', error);
        toast.error(
          'Load Failed',
          error instanceof Error ? error.message : 'Failed to load conversation'
        );
      } finally {
        setLoading(false);
      }
    };

    loadConversation();
  }, [conversationId, toast]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <ChatInterface
        initialMessages={initialMessages}
        initialTraceEvents={initialTraceEvents}
        conversationId={conversationId || undefined}
      />
    </div>
  );
}

function mapEventTypeToRole(
  eventType: string
): MessageRecord['role'] {
  switch (eventType) {
    case 'user_message':
      return 'user';
    case 'assistant_message':
    case 'llm_response':
      return 'assistant';
    case 'tool_response':
      return 'tool';
    default:
      return 'system';
  }
}

function extractContent(event: { data: unknown }): string | Record<string, unknown> {
  if (typeof event.data === 'string') {
    return event.data;
  }

  if (event.data && typeof event.data === 'object') {
    const data = event.data as Record<string, unknown>;
    // Try to find a content field
    if (data.content !== undefined) {
      if (typeof data.content === 'string') {
        return data.content;
      }
      return data.content as Record<string, unknown>;
    }
    // Otherwise return the whole data object as JSON
    return data;
  }

  return '';
}