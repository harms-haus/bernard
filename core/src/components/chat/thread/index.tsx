import { v4 as uuidv4 } from "uuid";
import { ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useStreamContext } from "./providers/Stream";
import { useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "./ensure-tool-responses";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import {
  ArrowDown,
  Loader,
} from "lucide-react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { toast } from "sonner";
import { AgentSelectorButton } from "@/components/chat/AgentSelector";
import { useThreads } from "./providers/Thread";
import { getAPIClient } from "@/lib/api/client";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div className="flex flex-col h-full">
        <div ref={context.contentRef} className={props.contentClassName}>
          <div className="max-w-3xl mx-auto flex flex-col gap-4 w-full">
            {props.content}
          </div>
        </div>
        {props.footer}
      </div>
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="w-4 h-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

export function Thread() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId");
  const [input, setInput] = useState("");
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [hasTriggeredAutoRename, setHasTriggeredAutoRename] = useState(false);

  const stream = useStreamContext();
  const messages = stream.messages;
  const isLoading = stream.isLoading;

  const lastError = useRef<string | undefined>(undefined);
  const pollIntervalRef = useRef<number | null>(null);
  const { getThreads } = useThreads();

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    try {
      const message = (stream.error as any).message;
      if (!message || lastError.current === message) {
        return;
      }

      lastError.current = message;
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  const prevMessageLength = useRef(0);
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (
      threadId &&
      !hasTriggeredAutoRename &&
      messages.length >= 2
    ) {
      const apiClient = getAPIClient();
      apiClient.autoRenameThread(threadId)
        .then(() => {
          getThreads();
          let pollAttempts = 0;
          const maxAttempts = 6;
          
          // Clear any existing interval
          if (pollIntervalRef.current !== null) {
            window.clearInterval(pollIntervalRef.current);
          }
          
          pollIntervalRef.current = window.setInterval(() => {
            pollAttempts++;
            getThreads();
            if (pollAttempts >= maxAttempts) {
              if (pollIntervalRef.current !== null) {
                window.clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
          }, 2000);
        })
        .catch((err: unknown) => {
          console.error('Auto-rename failed:', err);
          // Clear interval on error
          if (pollIntervalRef.current !== null) {
            window.clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        });

      setHasTriggeredAutoRename(true);
    }
  }, [hasTriggeredAutoRename, threadId, getThreads, messages.length]);

  // Cleanup polling interval when threadId changes or on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [threadId]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: input,
    };

    const toolMessages = ensureToolCallsHaveResponses(stream.messages);
    stream.submit(
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
      },
    );

    setInput("");
  };

  const chatStarted = !!threadId || !!messages.length;
  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <StickToBottom className="relative flex-1 overflow-hidden">
        <StickyToBottomContent
          className={cn(
            "absolute inset-0 flex flex-col px-4",
            !chatStarted && "justify-center pt-[25vh]",
            chatStarted && "pt-8"
          )}
          contentClassName="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent"
          content={
            <>
              {messages
                .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
                .map((message, index) => {
                  // Skip standalone tool result messages - they're rendered inline with their AI messages
                  if (message.type === "tool") {
                    return null;
                  }

                  return message.type === "human" ? (
                    <HumanMessage
                      key={message.id || `${message.type}-${index}`}
                      message={message}
                    />
                  ) : (
                    <AssistantMessage
                      key={message.id || `${message.type}-${index}`}
                      message={message}
                      nextMessages={messages.slice(index + 1)}
                    />
                  );
                })}
              {hasNoAIOrToolMessages && !!stream.interrupt && (
                <AssistantMessage
                  key="interrupt-msg"
                  message={undefined}
                />
              )}
              {isLoading && !firstTokenReceived && (
                <AssistantMessageLoading />
              )}
            </>
          }
          footer={
            <div className="flex flex-col items-center gap-8 shrink-0 pb-4">
              {!chatStarted && (
                <div className="flex gap-3 items-center">
                  <LangGraphLogoSVG className="flex-shrink-0 h-8" />
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Agent Chat
                  </h1>
                </div>
              )}

              <ScrollToBottom className="self-center mb-4 animate-in fade-in-0 zoom-in-95" />

              <div className="bg-muted rounded-2xl border shadow-xs mx-auto mb-8 w-full max-w-3xl relative z-10">
                <form
                  onSubmit={handleSubmit}
                  className="grid grid-rows-[1fr_auto] gap-2 max-w-3xl mx-auto"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.metaKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        const el = e.target as HTMLElement | undefined;
                        const form = el?.closest("form");
                        form?.requestSubmit();
                      }
                    }}
                    placeholder="Type your message..."
                    className="p-3.5 pb-0 border-none bg-transparent field-sizing-content shadow-none ring-0 outline-none focus:outline-none focus:ring-0 resize-none"
                  />

                  <div className="flex items-center justify-between p-2 pt-4">
                    <AgentSelectorButton />
                    {stream.isLoading ? (
                      <Button key="stop" type="button" onClick={() => stream.stop()}>
                        <Loader className="w-4 h-4 animate-spin" />
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        className="transition-all shadow-md"
                        disabled={isLoading || !input.trim()}
                      >
                        Send
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          }
        />
      </StickToBottom>
    </div>
  );
}
