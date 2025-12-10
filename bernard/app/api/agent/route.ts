import type { NextRequest } from "next/server";
import type { BaseMessage } from "@langchain/core/messages";

import { createOrchestrator } from "@/agent/orchestrator/factory";
import { mapOpenAIToMessages, type OpenAIMessage } from "@/lib/messages";
import { getPrimaryModel } from "@/lib/models";
import { RecordKeeper } from "@/lib/recordKeeper";
import { getRedis } from "@/lib/redis";
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

function newInboundMessages(messages: BaseMessage[]): BaseMessage[] {
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const type = (messages[i] as { _getType?: () => string })._getType?.();
    if (type === "ai") {
      lastAssistantIndex = i;
      break;
    }
  }
  return messages.slice(lastAssistantIndex + 1);
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401 });
  }

  const store = new TokenStore(getRedis());
  const auth = await store.validate(token);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  let body: AgentRequestBody | null = null;
  try {
    body = (await req.json()) as AgentRequestBody;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), { status: 400 });
  }

  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "`messages` array is required" }), { status: 400 });
  }

  let inputMessages: BaseMessage[];
  try {
    inputMessages = mapOpenAIToMessages(body.messages);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Invalid message role",
        reason: err instanceof Error ? err.message : String(err)
      }),
      { status: 400 }
    );
  }

  const responseModel = body.model ?? getPrimaryModel("response");
  const intentModel = getPrimaryModel("intent", { fallback: [responseModel] });

  const redis = getRedis();
  const keeper = new RecordKeeper(redis, {});
  await keeper.closeIfIdle();

  const requestStart = Date.now();

  const { requestId, conversationId } = await keeper.startRequest(token, responseModel, {
    conversationId: body.conversationId,
    place: body.place,
    clientMeta: body.clientMeta
  });

  const turnId = await keeper.startTurn(requestId, conversationId, token, responseModel);

  try {
    const inboundDelta = newInboundMessages(inputMessages);
    const { orchestrator } = createOrchestrator(keeper, {
      intentModel,
      responseModel,
      responseCallerOptions: { maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined }
    });
    const result = await orchestrator.run({
      conversationId,
      incoming: inputMessages,
      persistable: inboundDelta,
      requestId,
      turnId,
      intentInput: { messageText: undefined },
      memoryInput: { query: undefined }
    });

    await keeper.completeRequest(requestId, Date.now() - requestStart);
    await keeper.endTurn(turnId, { status: "ok", latencyMs: Date.now() - requestStart });

    const finalText = result.response.text ?? "";
    return new Response(finalText, { headers: { "Content-Type": "text/plain" } });
  } catch (err) {
    if (isRateLimit(err)) {
      await keeper.recordRateLimit(token, responseModel);
    }
    await keeper.endTurn(turnId, {
      status: "error",
      latencyMs: Date.now() - requestStart,
      errorType: err instanceof Error ? err.name : "error"
    });
    const { status, reason } = describeError(err);
    return new Response(JSON.stringify({ error: "Agent request failed", reason }), { status });
  }
}


