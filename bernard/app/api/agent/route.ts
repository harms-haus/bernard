import type { NextRequest } from "next/server";

import { buildGraph, mapOpenAIToMessages, type OpenAIMessage } from "@/lib/agent";
import type { BaseMessage } from "@langchain/core/messages";
import { ConversationSummaryService } from "@/lib/conversationSummary";
import { getRedis } from "@/lib/redis";
import { RecordKeeper } from "@/lib/recordKeeper";
import { TokenStore } from "@/lib/tokenStore";

export const runtime = "nodejs";

type AgentRequestBody = {
  messages: OpenAIMessage[];
  stream?: boolean;
  conversationId?: string;
  place?: string;
  model?: string;
  clientMeta?: Record<string, unknown>;
};

type GraphResult = { messages?: BaseMessage[] };

type GraphStreamChunk = {
  data?: {
    messages?: BaseMessage[];
    agent?: { messages?: BaseMessage[] };
    tools?: { messages?: BaseMessage[] };
  };
};

type AgentGraph = {
  invoke: (input: { messages: BaseMessage[] }) => Promise<GraphResult>;
  stream: (
    input: { messages: BaseMessage[] },
    options: { streamMode: "messages" | "updates" }
  ) => AsyncIterable<GraphStreamChunk>;
};

function findMessages(value: unknown): BaseMessage[] | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    const looksLikeMessages = value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "content" in (item as Record<string, unknown>)
    );
    return looksLikeMessages ? (value as BaseMessage[]) : null;
  }

  for (const nested of Object.values(value)) {
    const found = findMessages(nested);
    if (found) return found;
  }

  return null;
}

function contentFromChunkPayload(chunk: GraphStreamChunk | Record<string, unknown> | null): string | null {
  if (!chunk || typeof chunk !== "object") return null;
  const topLevel = (chunk as { content?: unknown }).content;
  if (typeof topLevel === "string") return topLevel;
  const data = (chunk as { data?: { content?: unknown; text?: unknown } }).data;
  if (data) {
    if (typeof data.content === "string") return data.content;
    if (typeof data.text === "string") return data.text;
  }
  return null;
}

function contentFromMessages(messages: BaseMessage[]): string | null {
  if (!messages.length) return null;
  const last = messages[messages.length - 1] as { content?: unknown };
  const content = last?.content;

  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
    return joined || null;
  }
  if (content && typeof content === "object" && "text" in (content as Record<string, unknown>)) {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

function extractChunkText(chunk: unknown): string {
  if (!chunk) return "";
  if (Array.isArray(chunk)) {
    return chunk.map((part) => extractChunkText(part)).filter(Boolean).join("");
  }
  if (typeof chunk === "object") {
    const obj = chunk as Record<string, unknown>;
    const content = obj["content"];
    if (typeof content === "string") return content;
    const kwargs = obj["kwargs"] as Record<string, unknown> | undefined;
    if (kwargs) {
      const kwContent = kwargs["content"];
      if (typeof kwContent === "string") return kwContent;
    }
    const data = obj["data"] as Record<string, unknown> | undefined;
    if (data) {
      const dataContent = data["content"];
      if (typeof dataContent === "string") return dataContent;
      const dataText = data["text"];
      if (typeof dataText === "string") return dataText;
    }
  }
  return "";
}

function extractMessagesFromChunk(chunk: unknown): BaseMessage[] | null {
  if (!chunk || typeof chunk !== "object") return null;

  const direct = (chunk as { messages?: unknown }).messages;
  if (Array.isArray(direct)) return direct as BaseMessage[];

  const data = (chunk as GraphStreamChunk).data;
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data.agent?.messages)) return data.agent.messages;
  if (Array.isArray(data.tools?.messages)) return data.tools.messages;
  return null;
}

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429/.test(msg) || /rate limit/i.test(msg);
}

function isAsyncIterable<T = unknown>(value: unknown): value is AsyncIterable<T> {
  return Boolean(value) && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function";
}

function describeError(err: unknown, fallbackStatus = 500) {
  const statusCandidate = (err as { status?: unknown })?.status;
  const status = typeof statusCandidate === "number" ? statusCandidate : fallbackStatus;

  const nestedMessage = (err as { error?: { message?: unknown } })?.error?.message;
  const message =
    typeof nestedMessage === "string"
      ? nestedMessage
      : typeof (err as { message?: unknown })?.message === "string"
        ? (err as { message: string }).message
        : err instanceof Error
          ? err.message
          : String(err);

  const errorType = err instanceof Error ? err.name : "error";

  return { status, reason: message, errorType };
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), {
      status: 401
    });
  }

  const store = new TokenStore(getRedis());
  const auth = await store.validate(token);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401
    });
  }

  let body: AgentRequestBody | null = null;
  try {
    body = (await req.json()) as AgentRequestBody;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), {
      status: 400
    });
  }

  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "`messages` array is required" }), {
      status: 400
    });
  }

  const redis = getRedis();
  let summarizer: ConversationSummaryService | undefined;
  try {
    summarizer = new ConversationSummaryService();
  } catch (err) {
    console.warn("Summarizer unavailable:", err);
  }
  const keeper = new RecordKeeper(redis, summarizer ? { summarizer } : {});
  await keeper.closeIfIdle();

  const model = body.model ?? process.env["OPENROUTER_MODEL"] ?? "kwaipilot/KAT-coder-v1:free";
  const inputMessages = mapOpenAIToMessages(body.messages);
  const shouldStream = body.stream ?? true;

  const requestStart = Date.now();
  const requestOpts: { place?: string; clientMeta?: Record<string, unknown>; conversationId?: string } = {};
  if (body.place) requestOpts.place = body.place;
  if (body.clientMeta) requestOpts.clientMeta = body.clientMeta;
  if (body.conversationId) requestOpts.conversationId = body.conversationId;
  const { requestId, conversationId } = await keeper.startRequest(token, model, requestOpts);
  await keeper.appendMessages(conversationId, inputMessages);
  const turnId = await keeper.startTurn(requestId, conversationId, token, model);

  const graph = buildGraph({
    recordKeeper: keeper,
    turnId,
    conversationId,
    requestId,
    token,
    model
  }) as unknown as AgentGraph;

  const encoder = new TextEncoder();

  if (!shouldStream) {
    try {
      const result = await graph.invoke({ messages: inputMessages });
      const allMessages = result.messages ?? inputMessages;
      if (allMessages?.length) {
        const newMessages = allMessages.slice(inputMessages.length);
        if (newMessages.length) {
          await keeper.appendMessages(conversationId, newMessages);
        }
      }
      await keeper.completeRequest(requestId, Date.now() - requestStart);
      await keeper.endTurn(turnId, {
        status: "ok",
        latencyMs: Date.now() - requestStart
      });
      return Response.json({ messages: allMessages });
    } catch (err) {
      if (isRateLimit(err)) {
        await keeper.recordRateLimit(token, model);
      }
      await keeper.endTurn(turnId, {
        status: "error",
        latencyMs: Date.now() - requestStart,
        errorType: err instanceof Error ? err.name : "error"
      });
      const { status, reason } = describeError(err);
      return new Response(JSON.stringify({ error: "Agent request failed", reason }), {
        status
      });
    }
  }

  let iterator: AsyncIterable<GraphStreamChunk>;
  try {
    iterator = graph.stream({ messages: inputMessages }, { streamMode: "messages" as const });
  } catch (err) {
    if (isRateLimit(err)) {
      await keeper.recordRateLimit(token, model);
    }
    const { status, reason, errorType } = describeError(err);
    await keeper.endTurn(turnId, {
      status: "error",
      latencyMs: Date.now() - requestStart,
      errorType
    });
    return new Response(JSON.stringify({ error: "Agent request failed", reason }), { status });
  }
  if (!isAsyncIterable(iterator)) {
    const err = new Error("Agent stream is unavailable");
    await keeper.endTurn(turnId, {
      status: "error",
      latencyMs: Date.now() - requestStart,
      errorType: err.name
    });
    return new Response(JSON.stringify({ error: "Agent request failed", reason: err.message }), {
      status: 500
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let latestMessages: BaseMessage[] | null = null;
      let latestContent: string | null = null;
      try {
        for await (const chunk of iterator) {
          if (process.env["DEBUG_STREAM"] === "1") {
            console.warn("agent stream chunk", JSON.stringify(chunk));
          }
          const maybeMessages = extractMessagesFromChunk(chunk) ?? findMessages(chunk);
          if (maybeMessages) {
            latestMessages = maybeMessages;
            const content = contentFromMessages(maybeMessages);
            if (content !== null) {
              latestContent = content;
            }
          }

          const chunkDelta = extractChunkText(chunk);
          if (chunkDelta) {
            latestContent = (latestContent ?? "") + chunkDelta;
          }

          const chunkContent = contentFromChunkPayload(chunk);
          if (chunkContent !== null && !chunkDelta) {
            latestContent = chunkContent;
          }

          const basePayload =
            Array.isArray(chunk) || typeof chunk !== "object" || chunk === null
              ? { chunk }
              : chunk;
          const payload =
            latestContent !== null ? { ...basePayload, content: latestContent } : basePayload;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }

        if (latestMessages && latestMessages.length > inputMessages.length) {
          const newMessages = latestMessages.slice(inputMessages.length);
          await keeper.appendMessages(conversationId, newMessages);
        }

        const finalContent = contentFromMessages(latestMessages ?? []) ?? latestContent;
        if (finalContent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: finalContent })}\n\n`));
        }

        await keeper.completeRequest(requestId, Date.now() - requestStart);
        await keeper.endTurn(turnId, {
          status: "ok",
          latencyMs: Date.now() - requestStart
        });

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if (isRateLimit(err)) {
          await keeper.recordRateLimit(token, model);
        }
        await keeper.endTurn(turnId, {
          status: "error",
          latencyMs: Date.now() - requestStart,
          errorType: err instanceof Error ? err.name : "error"
        });
        const { status, reason } = describeError(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Agent stream failed", reason, status })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}

// Exposed for focused tests
export const __agentRouteTestHooks = { extractMessagesFromChunk };

