import { useState, useEffect, FormEvent, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { useStreamContext } from '@/providers/StreamProvider';
import { useThreads } from '@/providers/ThreadProvider';
import { HumanMessage } from './messages/human';
import { AssistantMessage, AssistantMessageLoading } from './messages/ai';
import { cn } from '@/lib/utils';
import { ensureToolCallsHaveResponses, DO_NOT_RENDER_ID_PREFIX } from '@/lib/ensure-tool-responses';
import { Plus, Send, StopCircle } from 'lucide-react';
import type { Message } from '@langchain/langgraph-sdk';
import { getAPIClient } from '@/lib/api/client';

export function Thread() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get('threadId');

  const stream = useStreamContext();
  const { messages, submit, isLoading, stop } = stream;
  const scrollRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState('');
  const prevMessageLength = useRef(0);
  const [hasTriggeredAutoRename, setHasTriggeredAutoRename] = useState(false);
  const { getThreads } = useThreads();

  useEffect(() => {
    setInput('');
    prevMessageLength.current = 0;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadId]);

  useEffect(() => {
    prevMessageLength.current = messages.length;

    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-rename thread after first message exchange
  useEffect(() => {
    if (
      threadId &&
      !hasTriggeredAutoRename &&
      messages.length === 2
    ) {
      const firstHumanMessage = messages.find(m => m.type === 'human');

      if (firstHumanMessage) {
        const messageContent = typeof firstHumanMessage.content === 'string'
          ? firstHumanMessage.content
          : JSON.stringify(firstHumanMessage.content);

        const apiClient = getAPIClient();
        apiClient.autoRenameThread(threadId, messageContent)
          .then(() => {
            getThreads();
          })
          .catch((err: unknown) => {
            console.error('Auto-rename failed:', err);
          });

        setHasTriggeredAutoRename(true);
      }
    }
  }, [messages, hasTriggeredAutoRename, threadId, getThreads]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: 'human',
      content: input.trim(),
    };

    const toolMessages = ensureToolCallsHaveResponses(messages);
    submit(
      { messages: [...toolMessages, newHumanMessage] },
      {
        optimisticValues: (prev) => ({
          ...prev,
          messages: [
            ...(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      }
    );
    setInput('');
  };

  const chatStarted = messages.length > 0;

  return (
    <div
      ref={scrollRef}
      data-testid="chat-messages-container"
      className={cn(
        "flex-1 overflow-y-auto px-4 h-full [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-track]:bg-transparent",
        !chatStarted && "flex flex-col items-center pt-[25vh]",
        chatStarted && "pt-8"
      )}
    >
      <div className="pt-8 pb-4 max-w-3xl mx-auto flex flex-col gap-0 w-full" data-testid="chat-messages-list">
        {!chatStarted && (
          <div className="flex flex-col items-center gap-4 mb-8" data-testid="welcome-message">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">B</AvatarFallback>
            </Avatar>
            <h1 className="text-3xl font-bold tracking-tight text-center text-foreground">
              How can I help you today?
            </h1>
          </div>
        )}

        {messages
          .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
          .map((message, index) => {
            if (message.type === 'tool') return null;

            return message.type === 'human' ? (
              <HumanMessage
                key={message.id || `human-${index}`}
                message={message}
                isLoading={isLoading}
              />
            ) : (
              <AssistantMessage
                key={message.id || `ai-${index}`}
                message={message}
                nextMessages={messages.slice(index + 1)}
                isLoading={isLoading}
              />
            );
          })}

        {isLoading && <AssistantMessageLoading />}
      </div>

      <div className={cn(
        "bg-background/95 backdrop-blur-sm p-4 shrink-0",
        !chatStarted && "flex flex-col items-center"
      )} data-testid="chat-input-area">
        <div className="max-w-3xl w-full mx-auto relative px-4 sm:px-0">
          <div className="bg-muted/50 hover:bg-muted/80 transition-colors rounded-3xl border shadow-sm p-2">
            <form onSubmit={handleSubmit} className="flex flex-col gap-2" data-testid="chat-form">
              <Textarea
                data-testid="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.metaKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Type your message..."
                className="min-h-[44px] max-h-[400px] resize-none border-0 bg-transparent shadow-none ring-0 outline-none focus:ring-0 px-3 py-2 text-base"
                style={{ fieldSizing: 'content' } as any}
              />
              <div className="flex items-center justify-between px-2 pb-1">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" type="button" className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full">
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {isLoading ? (
                    <Button
                      data-testid="stop-button"
                      key="stop"
                      onClick={stop}
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="h-9 w-9 rounded-full shadow-sm"
                    >
                      <StopCircle className="h-5 w-5" />
                    </Button>
                  ) : (
                    <Button
                      data-testid="send-button"
                      type="submit"
                      disabled={!input.trim()}
                      size="icon"
                      className="h-9 w-9 rounded-full shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-3 px-4">
            Bernard can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>
    </div>
  );
}
