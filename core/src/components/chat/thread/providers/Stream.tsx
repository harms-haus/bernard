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

const useTypedStream = useStream<StateType>;

type StreamContextType = ReturnType<typeof useTypedStream>;

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

  const streamValue = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    threadId: threadId ?? null,
    onThreadId: (id) => {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("threadId", id);
      router.replace(newUrl.pathname + newUrl.search);
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
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
    <StreamContext.Provider value={streamValue}>
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
  const [apiKey, setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || undefined;
  });

  useEffect(() => {
    const updateApiKey = () => {
      const storedKey = getApiKey();
      setApiKey(storedKey || undefined);
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
