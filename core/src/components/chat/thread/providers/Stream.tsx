import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import { useSearchParams, useRouter } from "next/navigation";
import { getApiKey } from "../api-key";
import { useThreads } from "./Thread";
import { toast } from "sonner";

export type StateType = { messages: Message[] };

export interface ToolProgressEvent {
  _type: "tool_progress";
  tool: string;
  phase: "step" | "complete";
  message: string;
  timestamp: number;
}

const useTypedStream = useStream<StateType>;

// Extend the UseStream return type to include latestProgress and ensure all SDK methods are available
type StreamContextType = ReturnType<typeof useTypedStream> & {
  latestProgress: ToolProgressEvent | null;
  // Ensure branching methods from UseStream are available
  getMessagesMetadata: (message: Message, index?: number) => {
    messageId: string;
    firstSeenState: { parent_checkpoint?: { thread_id: string; checkpoint_ns: string; checkpoint_id: string } | undefined } | undefined;
    branch: string | undefined;
    branchOptions: string[] | undefined;
    streamMetadata: Record<string, unknown> | undefined;
  } | undefined;
  setBranch: (branch: string) => void;
};

const StreamContext = createContext<StreamContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/info`, {
      ...(apiKey && {
        headers: {
          "X-Api-Key": apiKey,
        },
      }),
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

interface StreamSessionProps {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
}

function StreamSession({
  children,
  apiKey,
  apiUrl,
  assistantId,
}: StreamSessionProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get("threadId");
  const { getThreads, setThreads } = useThreads();
  const [latestProgress, setLatestProgress] = useState<ToolProgressEvent | null>(null);

  const streamValue = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    threadId: threadId ?? null,
    fetchStateHistory: true,
    onThreadId: (id) => {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("threadId", id);
      router.replace(newUrl.pathname + newUrl.search);
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
    onCustomEvent: (event, options) => {
      const eventData = event as unknown as Record<string, unknown>;
      // Handle tool_progress custom events
      if (eventData._type === "tool_progress") {
        const phase = eventData.phase;
        if (phase !== "step" && phase !== "complete") {
          console.error("Invalid phase value in tool_progress event:", phase);
          return;
        }
        const progressEvent: ToolProgressEvent = {
          _type: "tool_progress",
          tool: String(eventData.tool),
          phase: phase,
          message: String(eventData.message),
          timestamp: Number(eventData.timestamp),
        };
        setLatestProgress(progressEvent);
        options.mutate((prev) => ({
          ...prev,
          latestProgress: progressEvent,
        }));
        return;
      }
    },
  });

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl]);

  return (
    <StreamContext.Provider value={{ ...streamValue, latestProgress } as StreamContextType}>
      {children}
    </StreamContext.Provider>
  );
}

interface StreamProviderProps {
  children: ReactNode;
  apiUrl: string;
  assistantId: string;
}

export function StreamProvider({ children, apiUrl, assistantId }: StreamProviderProps) {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    const storedKey = getApiKey();
    return storedKey || null;
  });

  useEffect(() => {
    const updateApiKey = () => {
      const storedKey = getApiKey();
      setApiKey(storedKey || null);
    };

    // Check for storage events (cross-tab updates)
    window.addEventListener("storage", updateApiKey);
    
    // Poll for changes (in case storage events don't fire)
    const interval = setInterval(updateApiKey, 1000);

    return () => {
      window.removeEventListener("storage", updateApiKey);
      clearInterval(interval);
    };
  }, []);

  return (
    <StreamSession apiKey={apiKey} apiUrl={apiUrl} assistantId={assistantId}>
      {children}
    </StreamSession>
  );
}

export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
