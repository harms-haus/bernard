import { createContext, useContext, ReactNode, useState, useCallback, useRef } from 'react';
import type { Message } from '@langchain/langgraph-sdk';

interface StreamContextType {
  messages: Message[];
  submit: (input: { messages: Message[] }, options?: { threadId?: string }) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  stop: () => void;
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

export function StreamProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const submit = useCallback(async (input: { messages: Message[] }, options?: { threadId?: string }) => {
    setIsLoading(true);
    setError(null);
    abortControllerRef.current = new AbortController();

    try {
      // Convert LangGraph messages to OpenAI format
      const messagesPayload = input.messages.map(msg => ({
        role: msg.type === 'human' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }));

      const response = await fetch(`/v1/chat/completions`, {
        credentials: 'same-origin',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'bernard-v1',
          messages: messagesPayload,
          stream: true,
          ...(options?.threadId ? { chatId: options.threadId } : {})
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to send message');
      if (!response.body) throw new Error('Response body is null');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Add user message immediately
      const lastUserMessage = input.messages[input.messages.length - 1];
      if (lastUserMessage.type === 'human') {
        const humanMessage: Message = {
          id: `human_${Date.now()}`,
          type: 'human',
          content: lastUserMessage.content
        };
        setMessages(prev => [...prev, humanMessage]);
      }

      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: `ai_${Date.now()}`,
        type: 'ai',
        content: ''
      };
      setMessages(prev => [...prev, assistantMessage]);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          
          let payload = raw;
          if (raw.startsWith('data: ')) {
            payload = raw.substring(6).trim();
          }

          if (!payload || payload === '[DONE]') {
            break;
          }

          try {
            const chunk = JSON.parse(payload);
            const text = chunk.choices?.[0]?.delta?.content;
            
            if (text) {
              setMessages(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg.type === 'ai') {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    content: (typeof lastMsg.content === 'string' ? lastMsg.content : '') + text
                  };
                }
                return updated;
              });
            }
          } catch {
            // Ignore parse errors for partial chunks
          }

          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  return (
    <StreamContext.Provider value={{ messages, submit, isLoading, error, stop }}>
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error('useStream must be used within a StreamProvider');
  }
  return context;
}
