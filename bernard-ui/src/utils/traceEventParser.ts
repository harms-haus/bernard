import type { MessageRecord } from '../../../bernard/lib/conversation/types';

export interface TraceEvent {
  id: string;
  type: 'llm_call' | 'tool_call';
  data: any;
  timestamp: Date;
  status: 'loading' | 'completed';
  result?: any;
  durationMs?: number;
}

/**
 * Parse a trace chunk from the streaming data and return TraceEvent objects
 */
export function parseTraceChunk(traceData: any): TraceEvent[] {
  const traceEvents: TraceEvent[] = [];

  if (traceData.type === 'llm_call' || traceData.type === 'tool_call') {
    // Create new call event with loading status
    const traceEvent: TraceEvent = {
      id: `trace-${Date.now()}-${Math.random()}`,
      type: traceData.type,
      data: traceData,
      timestamp: new Date(),
      status: 'loading'
    };

    traceEvents.push(traceEvent);
  } else if (traceData.type === 'llm_call_complete') {
    // This would normally update an existing event, but for streaming we handle this differently
    // For utility purposes, we'll return an empty array since this is handled by the caller
    return [];
  } else if (traceData.type === 'tool_call_complete') {
    // This would normally update an existing event, but for streaming we handle this differently
    // For utility purposes, we'll return an empty array since this is handled by the caller
    return [];
  }

  return traceEvents;
}

/**
 * Extract trace events from historical conversation messages
 */
export function extractTraceEventsFromMessages(messages: MessageRecord[]): TraceEvent[] {
  const traceEvents: TraceEvent[] = [];

  for (const message of messages) {

    // Extract LLM call events from system messages with trace content
    if (message.role === 'system' && typeof message.content === 'object' && message.content && 'type' in message.content) {
      const content = message.content as any;
      if (content.type === 'llm_call') {
        const traceEvent: TraceEvent = {
          id: `trace-llm-${message.id}`,
          type: 'llm_call',
          data: {
            model: content.model || 'Unknown Model',
            context: content.context || [],
            tools: content.tools || [],
            totalContextTokens: content.totalContextTokens || content.contextTokens,
            ...content // Include any other properties
          },
          timestamp: new Date(content.at || message.createdAt),
          status: 'completed',
          result: {
            ...(message.metadata?.result || content.result),
            actualTokens: content.tokens ? {
              promptTokens: content.tokens.in || 0,
              completionTokens: content.tokens.out || 0,
              totalTokens: (content.tokens.in || 0) + (content.tokens.out || 0)
            } : (message.metadata?.tokens ? {
              promptTokens: message.metadata.tokens.in || 0,
              completionTokens: message.metadata.tokens.out || 0,
              totalTokens: (message.metadata.tokens.in || 0) + (message.metadata.tokens.out || 0)
            } : (message.metadata?.result as any)?.actualTokens)
          }
        };
        traceEvents.push(traceEvent);
      } else if (content.type === 'llm_call_complete') {
        // Find the corresponding LLM call event and update it with completion data
        const llmCallEventIndex = traceEvents.findIndex(event =>
          event.type === 'llm_call' && event.status === 'completed'
        );
        if (llmCallEventIndex >= 0) {
          traceEvents[llmCallEventIndex] = {
            ...traceEvents[llmCallEventIndex],
            result: {
              ...traceEvents[llmCallEventIndex].result,
              ...content.result,
              actualTokens: content.tokens ? {
                promptTokens: content.tokens.in || 0,
                completionTokens: content.tokens.out || 0,
                totalTokens: (content.tokens.in || 0) + (content.tokens.out || 0)
              } : (content.result?.actualTokens || traceEvents[llmCallEventIndex].result?.actualTokens)
            },
            durationMs: content.latencyMs || message.metadata?.latencyMs
          };
        }
      }
    }

    // Extract tool call events from system messages with trace content
    if (message.role === 'system' && typeof message.content === 'object' && message.content && 'type' in message.content) {
      const content = message.content as any;
      if (content.type === 'tool_call') {
        const toolCallInfo = {
          id: content.toolCallId,
          function: {
            name: content.toolName,
            arguments: content.arguments
          }
        };

        const traceEvent: TraceEvent = {
          id: `trace-tool-${message.id}`,
          type: 'tool_call',
          data: {
            toolCall: toolCallInfo
          },
          timestamp: new Date(content.at || message.createdAt),
          status: 'completed',
          result: message.metadata?.result || content.result
        };
        traceEvents.push(traceEvent);
      } else if (content.type === 'tool_call_complete') {
        // Find the corresponding tool call event and update it with completion data
        const toolCallEventIndex = traceEvents.findIndex(event =>
          event.type === 'tool_call' && event.status === 'completed' &&
          event.data.toolCall.id === content.toolCallId
        );
        if (toolCallEventIndex >= 0) {
          traceEvents[toolCallEventIndex] = {
            ...traceEvents[toolCallEventIndex],
            result: content.result,
            durationMs: content.latencyMs || message.metadata?.latencyMs
          };
        }
      }
    }
  }

  return traceEvents;
}

/**
 * Update trace events with completion data (for streaming)
 */
export function updateTraceEventWithCompletion(
  traceEvents: TraceEvent[],
  completionData: any
): TraceEvent[] {
  if (completionData.type === 'llm_call_complete') {
    // Update the most recent loading llm_call event to completed
    const events = [...traceEvents];
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'llm_call' && events[i].status === 'loading') {
        events[i] = {
          ...events[i],
          status: 'completed' as const,
          result: {
            ...completionData.result,
            actualTokens: completionData.actualTokens || (completionData.tokens ? {
              promptTokens: completionData.tokens.in || 0,
              completionTokens: completionData.tokens.out || 0,
              totalTokens: (completionData.tokens.in || 0) + (completionData.tokens.out || 0)
            } : (completionData.result?.actualTokens || events[i].result?.actualTokens))
          },
          durationMs: completionData.latencyMs
        };
        break;
      }
    }
    return events;
  } else if (completionData.type === 'tool_call_complete') {
    // Update matching tool_call event to completed
    return traceEvents.map(event => {
      if (event.type === 'tool_call' && event.status === 'loading' &&
          event.data.toolCall.id === completionData.toolCall.id) {
        return {
          ...event,
          status: 'completed' as const,
          result: completionData.result,
          durationMs: completionData.latencyMs
        };
      }
      return event;
    });
  }

  return traceEvents;
}
