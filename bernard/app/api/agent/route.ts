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
    options: { streamMode: "updates" }
  ) => AsyncIterable<GraphStreamChunk>;
};

function extractMessagesFromChunk(chunk: GraphStreamChunk): BaseMessage[] | null {
  const data = chunk.data;
  if (!data) return null;
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
  const keeper = new RecordKeeper(redis, { summarizer });
  await keeper.closeIfIdle();

  const model = body.model ?? process.env.OPENROUTER_MODEL ?? "kwaipilot/KAT-coder-v1:free";
  const inputMessages = mapOpenAIToMessages(body.messages);
  const shouldStream = body.stream ?? true;

  const requestStart = Date.now();
  const { requestId, conversationId } = await keeper.startRequest(token, model, {
    place: body.place,
    clientMeta: body.clientMeta,
    conversationId: body.conversationId
  });
  await keeper.appendMessages(conversationId, inputMessages);
  const turnId = await keeper.startTurn(requestId, conversationId, token, model);

  const graph = buildGraph({
    recordKeeper: keeper,
    turnId,
    conversationId,
    requestId,
    token,
    model
  }) as AgentGraph;

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
      return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
  }

  const iterator: AsyncIterable<GraphStreamChunk> = graph.stream(
    { messages: inputMessages },
    { streamMode: "updates" as const }
  );

  const stream = new ReadableStream({
    async start(controller) {
      let latestMessages: BaseMessage[] | null = null;
      try {
        for await (const chunk of iterator) {
          const maybeMessages = extractMessagesFromChunk(chunk);
          if (maybeMessages) {
            latestMessages = maybeMessages;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }

        if (latestMessages && latestMessages.length > inputMessages.length) {
          const newMessages = latestMessages.slice(inputMessages.length);
          await keeper.appendMessages(conversationId, newMessages);
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
        controller.error(err);
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

