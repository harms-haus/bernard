import { useStreamContext } from "../providers/Stream";
import { Message } from "@langchain/langgraph-sdk";
import { getContentString } from "../utils";
import { cn } from "@/lib/utils";

export function HumanMessage({
  message,
  isLoading,
}: {
  message: Message;
  isLoading: boolean;
}) {
  const contentString = getContentString(message.content);

  return (
    <div className={cn("flex items-center ml-auto gap-2 group")}>
      <p className="px-4 py-2 rounded-3xl bg-muted w-fit ml-auto whitespace-pre-wrap">
        {contentString}
      </p>
    </div>
  );
}
