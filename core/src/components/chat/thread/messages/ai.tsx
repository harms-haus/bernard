import { useStreamContext } from "../providers/Stream";
import { AIMessage, Message } from "@langchain/langgraph-sdk";
import { getContentString } from "../utils";
import { MarkdownText } from "../markdown-text";
import { cn } from "@/lib/utils";
import { ToolCalls, ToolResult } from "./tool-calls";

export function AssistantMessage({
  message,
}: {
  message: Message | undefined;
}) {
  if (!message) {
    return null;
  }

  const content = message.content ?? [];
  const contentString = getContentString(content);

  const hasToolCalls =
    message && "tool_calls" in message && message.tool_calls?.length;
  const isToolResult = message?.type === "tool";

  return (
    <div className="flex items-start mr-auto gap-2 group">
      {isToolResult ? (
        <ToolResult message={message} />
      ) : (
        <div className="flex flex-col gap-2">
          {contentString.length > 0 && (
            <div className="py-1">
              <MarkdownText>{contentString}</MarkdownText>
            </div>
          )}

          {hasToolCalls && <ToolCalls toolCalls={message.tool_calls} />}
        </div>
      )}
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="flex items-start mr-auto gap-2">
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-2 h-8">
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_infinite]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_0.5s_infinite]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_1s_infinite]"></div>
      </div>
    </div>
  );
}
