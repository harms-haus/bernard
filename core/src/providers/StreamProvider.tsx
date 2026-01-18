import { createContext, useContext, ReactNode, useRef, useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useThreads } from './ThreadProvider';
import type { Checkpoint, Message } from '@langchain/langgraph-sdk';

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

interface MessageMetadata {
  branch?: string;
  branchOptions?: string[];
  firstSeenState?: {
    parent_checkpoint?: Checkpoint | null | undefined;
    values?: StateType;
  };
}

interface StreamContextType {
  messages: Message[];
  submit: (input?: { messages: Message[] }, options?: {
    streamMode?: string[];
    optimisticValues?: (prev: StateType) => StateType;
    checkpoint?: unknown;
  }) => void;
  isLoading: boolean;
  stop: () => void;
  error: Error | null;
  latestProgress: ToolProgressEvent | null;
  resetProgress: () => void;
  getMessagesMetadata: (message: Message) => MessageMetadata | undefined;
  setBranch: (branch: string) => void;
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

// Export StreamContext for testing purposes
export { StreamContext };

// ============================================================================
// Test Stream Context (for testing only)
// ============================================================================

export type TestStreamContextType = {
  messages: Message[];
  isLoading: boolean;
  submit: (input?: { messages: Message[] }) => void;
  stop: () => void;
  error: Error | null;
  latestProgress: ToolProgressEvent | null;
  resetProgress: () => void;
  getMessagesMetadata: (message: Message) => MessageMetadata | undefined;
  setBranch: (branch: string) => void;
};

const TestStreamContext = createContext<TestStreamContextType | undefined>(undefined);

// Export TestStreamContext for test providers
export { TestStreamContext };

export function useStreamContext() {
  // Always call both context hooks at the top level (rules of hooks)
  const testContext = useContext(TestStreamContext);
  const context = useContext(StreamContext);

  // Check for test context first (used in test environment)
  if (testContext !== undefined) {
    return testContext;
  }

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
  useLangGraphStream?: boolean;
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

/**
 * LangGraph stream event types
 */
interface LangGraphStreamEvent {
  event: string;
  data: unknown;
  id?: string;
}

interface LangGraphMessageEvent {
  event: 'messages/partial' | 'messages/complete';
  data: Array<{
    id?: string;
    type: 'human' | 'ai' | 'tool';
    content: string | Array<{ type: string; text?: string }>;
    tool_calls?: Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
  }>;
  id?: string;
}

interface LangGraphMetadataEvent {
  event: 'metadata';
  data: { run_id: string; thread_id: string };
}

interface LangGraphErrorEvent {
  event: 'error';
  data: { error: string; message: string };
}

function isLangGraphMessageEvent(event: LangGraphStreamEvent): event is LangGraphMessageEvent {
  return event.event === 'messages/partial' || event.event === 'messages/complete';
}

function isLangGraphMetadataEvent(event: LangGraphStreamEvent): event is LangGraphMetadataEvent {
  return event.event === 'metadata';
}

function isLangGraphErrorEvent(event: LangGraphStreamEvent): event is LangGraphErrorEvent {
  return event.event === 'error';
}

/**
 * Parse SSE format where data can span multiple lines.
 * SSE format:
 *   id: <event_id>
 *   event: <event_type>
 *   data: <line1>
 *   data: <line2>
 *   ... (more data lines)
 *
 * After data lines, a blank line marks the end of the event.
 */
interface ParsedSSE {
  id?: string;
  event: string;
  data: string;
}

function parseSSEChunk(lines: string[]): ParsedSSE | null {
  let id: string | undefined;
  let event: string = '';
  let hasEventLine = false;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('id:')) {
      id = line.slice(3).trim();
    } else if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      hasEventLine = true;
    } else if (line.startsWith('data:')) {
      // Keep the full data line including the "data: " prefix
      // This preserves the JSON structure when data spans multiple lines
      dataLines.push(line);
    }
  }

  if (!hasEventLine && dataLines.length === 0) {
    return null;
  }

  // Join all data lines preserving the structure
  // Remove the "data: " prefix from each line before joining
  const dataContent = dataLines.map(l => l.startsWith('data: ') ? l.slice(6) : l).join('\n');

  return {
    id,
    event,
    data: dataContent,
  };
}

interface LangGraphValuesEvent {
  event: 'values';
  data: {
    messages: Array<{
      content: string;
      additional_kwargs?: Record<string, unknown>;
      response_metadata?: Record<string, unknown>;
      id: string;
      type: 'human' | 'ai' | 'tool';
      tool_call_chunks?: Array<unknown>;
      usage_metadata?: Record<string, unknown>;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
        type?: string;
      }>;
      invalid_tool_calls?: Array<unknown>;
      name?: string;
    }>;
    threadToolCallCount?: Record<string, number>;
    runToolCallCount?: Record<string, number>;
  };
  id?: string;
}

function isLangGraphValuesEvent(event: LangGraphStreamEvent): event is LangGraphValuesEvent {
  return event.event === 'values';
}

function convertValuesToMessages(event: LangGraphValuesEvent): Message[] {
  if (!event.data?.messages || !Array.isArray(event.data.messages)) {
    return [];
  }

  // Only process the last AI message (most recent state)
  const messages = event.data.messages;
  const aiMessages = messages.filter(m => m.type === 'ai');
  if (aiMessages.length === 0) return [];

  // Get the last AI message (current state)
  const lastAiMsg = aiMessages[aiMessages.length - 1];

  return [{
    type: 'ai' as const,
    id: lastAiMsg.id,
    content: typeof lastAiMsg.content === 'string' ? lastAiMsg.content : JSON.stringify(lastAiMsg.content),
    tool_calls: lastAiMsg.tool_calls?.map(tc => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || '{}'),
      id: tc.id,
    })),
  }];
}

function convertLangGraphToMessage(chunk: LangGraphMessageEvent): Message[] {
  if (!chunk.data || !Array.isArray(chunk.data)) return [];

  return chunk.data
    .filter(msg => msg.type === 'human' || msg.type === 'ai') // Only handle human/ai for streaming
    .map(msg => {
      const content = Array.isArray(msg.content)
        ? msg.content.map(c => (c as { text?: string }).text || '').join('')
        : (msg.content as string);

      if (msg.type === 'human') {
        return {
          type: 'human' as const,
          content,
        };
      }

      // AI message
      return {
        type: 'ai' as const,
        id: msg.id,
        content,
        tool_calls: msg.tool_calls?.map(tc => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || '{}'),
          id: tc.id,
        })),
      };
    });
}

function convertToLangGraphMessage(chunk: ChatCompletionChunk, role: string): Message | null {
  if (!chunk.choices || chunk.choices.length === 0) return null;
  const choice = chunk.choices[0];

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

export function StreamProvider({ children, apiUrl, threadId, useLangGraphStream = false }: StreamProviderProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { createThread } = useThreads();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [latestProgress, setLatestProgress] = useState<ToolProgressEvent | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const latestProgressRef = useRef<ToolProgressEvent | null>(null);
  const pendingToolProgressRef = useRef<boolean>(false);

  // Reset progress when a new message arrives
  const resetProgress = useCallback(() => {
    latestProgressRef.current = null;
    setLatestProgress(null);
  }, []);

  // Handle incoming tool progress events from the stream
  const handleToolProgress = (line: string) => {
    if (line.startsWith('event: tool_progress')) {
      pendingToolProgressRef.current = true;
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

      if (useLangGraphStream) {
        // LangGraph native streaming mode
        // Step 1: Get or create thread ID
        let currentThreadId: string = threadId || '';
        if (!currentThreadId) {
          const threadResponse = await fetch('/api/threads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: controller.signal,
          });
          if (!threadResponse.ok) {
            throw new Error(`Failed to create thread: ${threadResponse.statusText}`);
          }
          const threadData = await threadResponse.json();
          currentThreadId = threadData.thread_id;
          const newParams = new URLSearchParams(searchParams.toString());
          newParams.set('threadId', currentThreadId);
          router.replace(`/bernard/chat?${newParams.toString()}`);
          createThread(currentThreadId);
        }

        // Step 2: Create a run
        const openAIMessages = messagesToUse.map(msg => ({
          role: msg.type === 'human' ? 'user' : 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }));

        const runResponse = await fetch(`/api/threads/${currentThreadId}/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistant_id: 'bernard_agent',
            input: { messages: openAIMessages },
          }),
          signal: controller.signal,
        });

        if (!runResponse.ok) {
          const errorText = await runResponse.text();
          throw new Error(`Failed to create run: ${runResponse.status} - ${errorText}`);
        }

        const runData = await runResponse.json();
        const runId = runData.run_id;

        // Step 3: Stream the run
        const streamResponse = await fetch(`/api/threads/${currentThreadId}/runs/${runId}/stream`, {
          method: 'GET',
          headers: { 'Accept': 'text/event-stream' },
          signal: controller.signal,
        });

        if (!streamResponse.ok) {
          const errorText = await streamResponse.text();
          throw new Error(`Failed to stream run: ${streamResponse.status} - ${errorText}`);
        }

        if (!streamResponse.body) {
          throw new Error('Response body is null');
        }

        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer: string[] = [];
        let inEvent = false;

        while (true) {
          if (controller.signal.aborted) {
            setIsLoading(false);
            return;
          }

          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            // Empty line marks end of an SSE event
            if (line.trim() === '') {
              if (inEvent && sseBuffer.length > 0) {
                const parsed = parseSSEChunk(sseBuffer);
                if (parsed) {
                  try {
                    const eventData = JSON.parse(parsed.data) as LangGraphStreamEvent;

                    if (isLangGraphMetadataEvent(eventData)) {
                      // Handle metadata event - ignore for now
                    } else if (isLangGraphErrorEvent(eventData)) {
                      throw new Error(`LangGraph error: ${eventData.data.message}`);
                    } else if (isLangGraphValuesEvent(eventData)) {
                      const newMessages = convertValuesToMessages(eventData);
                      for (const msg of newMessages) {
                        setMessages(prev => {
                          const lastMsg = prev[prev.length - 1];
                          if (lastMsg && lastMsg.id === msg.id) {
                            const updated = [...prev];
                            if (msg.type === 'ai' && lastMsg.type === 'ai') {
                              updated[updated.length - 1] = {
                                ...lastMsg,
                                content: (lastMsg.content as string) + (msg.content as string),
                                tool_calls: msg.tool_calls || lastMsg.tool_calls,
                              };
                            } else {
                              updated[updated.length - 1] = msg;
                            }
                            return updated;
                          }
                          return [...prev, msg];
                        });
                      }
                    } else if (isLangGraphMessageEvent(eventData)) {
                      const newMessages = convertLangGraphToMessage(eventData);
                      for (const msg of newMessages) {
                        setMessages(prev => {
                          const lastMsg = prev[prev.length - 1];
                          if (lastMsg && lastMsg.id === msg.id) {
                            const updated = [...prev];
                            if (msg.type === 'ai' && lastMsg.type === 'ai') {
                              updated[updated.length - 1] = {
                                ...lastMsg,
                                content: (lastMsg.content as string) + (msg.content as string),
                                tool_calls: msg.tool_calls || lastMsg.tool_calls,
                              };
                            } else {
                              updated[updated.length - 1] = msg;
                            }
                            return updated;
                          }
                          return [...prev, msg];
                        });
                      }
                    } else if (eventData.event === 'done') {
                      // Handle completion
                      break;
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse LangGraph event data:', parseError);
                  }
                }
              }
              sseBuffer = [];
              inEvent = false;
              continue;
            }

            // Accumulate lines for current event
            if (line.startsWith('id:') || line.startsWith('event:') || line.startsWith('data:')) {
              sseBuffer.push(line);
              inEvent = true;
            } else if (inEvent) {
              // Continuation of data line (indented or not starting with prefix)
              sseBuffer.push(line);
            }
          }
        }
      } else {
        // Original OpenAI SSE mode
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
            model: 'bernard_agent',
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

            // Check if this is a pending tool progress event
            if (pendingToolProgressRef.current) {
              try {
                const event = JSON.parse(data) as ToolProgressEvent;
                latestProgressRef.current = event;
                setLatestProgress(event);
              } catch {
                // Ignore parse errors
              }
              pendingToolProgressRef.current = false;
              continue;
            }

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
              if (currentMessage.content && typeof currentMessage.content === 'string' && currentMessage.content.trim()) {
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
        }

        // Get thread ID from response headers if available
        const threadIdHeader = response.headers.get('x-thread-id');
        if (threadIdHeader && threadIdHeader !== threadId) {
          const newParams = new URLSearchParams(searchParams.toString());
          newParams.set('threadId', threadIdHeader);
          router.replace(`/bernard/chat?${newParams.toString()}`);
          createThread(threadIdHeader);
        }
      }

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err as Error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [apiUrl, threadId, useLangGraphStream, searchParams, router, createThread, stop]);

  // Fetch initial state if threadId is provided
  useEffect(() => {
    if (threadId) {
      // Could fetch thread history here if needed
      setMessages([]);
    }
  }, [threadId]);

  // Get metadata for a specific message
  const getMessagesMetadata = useCallback((_message: Message): MessageMetadata | undefined => {
    // TODO: Implement actual metadata retrieval from checkpoint/branch state
    // For now, return undefined as placeholder
    return undefined;
  }, []);

  // Set the current branch for the conversation
  const setBranch = useCallback((_branch: string) => {
    // TODO: Implement actual branch switching logic
    // This would involve updating the checkpoint/branch state
  }, []);

  const contextValue: StreamContextType = {
    messages,
    submit,
    isLoading,
    stop,
    error,
    latestProgress,
    resetProgress,
    getMessagesMetadata,
    setBranch,
  };

  return (
    <StreamContext.Provider value={contextValue}>
      {children}
    </StreamContext.Provider>
  );
}

export { StreamContext as default };
