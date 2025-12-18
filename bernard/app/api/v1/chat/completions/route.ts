import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCorsHeaders } from "@/app/api/_lib/cors";

import {
  BERNARD_MODEL_ID,
  collectToolCalls,
  contentFromMessage,
  createScaffolding,
  extractUsageFromMessages,
  findLastAssistantMessage,
  isBernardModel,
  mapChatMessages,
  hydrateMessagesWithHistory,
  validateAuth
} from "@/app/api/v1/_lib/openai";
import type { BaseMessage } from "@langchain/core/messages";
import type { OpenAIMessage } from "@/lib/conversation/messages";
import { resolveApiKey, resolveBaseUrl, resolveModel, splitModelAndProvider } from "@/lib/config/models";
import { runChatCompletionTurn } from "@/agent/loop/chatCompletionsTurn";
import { ChatOpenAILLMCaller } from "@/agent/llm/chatOpenAI";
import type { AgentOutputItem } from "@/agent/streaming/types";

export const runtime = "nodejs";

// OPTIONS handler for CORS preflight
export function OPTIONS(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(null)
  });
}

type ChatCompletionBody = {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
  stop?: string | string[] | null;
  logit_bias?: Record<string, number>;
  // unsupported but may appear; reject when present
  n?: number;
  tools?: unknown;
  response_format?: unknown;
  user?: unknown;
  prediction?: unknown;
  service_tier?: unknown;
  store?: unknown;
  seed?: unknown;
};

const UNSUPPORTED_KEYS: Array<keyof ChatCompletionBody> = [
  "n",
  "tools",
  "response_format",
  "user",
  "prediction",
  "service_tier",
  "store",
  "seed"
];

export async function POST(req: NextRequest) {
  const auth = await validateAuth(req);
  if ("error" in auth) return auth.error;

  let body: ChatCompletionBody | null = null;
  try {
    body = (await req.json()) as ChatCompletionBody;
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: getCorsHeaders(null) });
  }

  if (!body?.messages || !Array.isArray(body.messages)) {
    return new NextResponse(JSON.stringify({ error: "`messages` array is required" }), { status: 400, headers: getCorsHeaders(null) });
  }

  for (const key of UNSUPPORTED_KEYS) {
    if (body[key] !== undefined && body[key] !== null) {
      return new NextResponse(JSON.stringify({ error: `Unsupported parameter: ${key}` }), { status: 400, headers: getCorsHeaders(null) });
    }
  }

  if (body.n && body.n > 1) {
    return new NextResponse(JSON.stringify({ error: "`n>1` is not supported" }), { status: 400, headers: getCorsHeaders(null) });
  }

  if (!isBernardModel(body.model)) {
    return new NextResponse(JSON.stringify({ error: "Model not found", allowed: BERNARD_MODEL_ID }), { status: 404, headers: getCorsHeaders(null) });
  }

  const includeUsage = body.stream_options?.include_usage === true;
  const shouldStream = body.stream === true;
  const start = Date.now();

  let inputMessages: BaseMessage[];
  try {
    inputMessages = mapChatMessages(body.messages);
  } catch (err) {
    return new NextResponse(
      JSON.stringify({ error: "Invalid messages" }),
      { status: 400, headers: getCorsHeaders(null) }
    );
  }

  const responseModelConfig = await resolveModel("response");
  const intentModelConfig = await resolveModel("intent", { fallback: [responseModelConfig.id] });

  const scaffold = await createScaffolding({ token: auth.token, responseModelOverride: responseModelConfig.id });
  const {
    keeper,
    conversationId,
    requestId,
    turnId,
    responseModelName: scaffoldResponseModel,
    intentModelName: scaffoldIntentModel,
    isNewConversation
  } = scaffold;
  const responseModelName = scaffoldResponseModel ?? responseModelConfig.id;
  const intentModelName = scaffoldIntentModel ?? intentModelConfig.id;

  const mergedMessages = isNewConversation
    ? inputMessages
    : await hydrateMessagesWithHistory({
        keeper,
        conversationId,
        incoming: inputMessages
      });

  const intentModel = splitModelAndProvider(intentModelName);
  const intentApiKey =
    resolveApiKey(undefined, intentModelConfig.options) ?? resolveApiKey(undefined, responseModelConfig.options);
  const intentBaseURL = resolveBaseUrl(undefined, intentModelConfig.options);
  const responseModel = splitModelAndProvider(responseModelName);
  const responseApiKey = resolveApiKey(undefined, responseModelConfig.options);
  const responseBaseURL = resolveBaseUrl(undefined, responseModelConfig.options);

  const responseLLMCaller = new ChatOpenAILLMCaller(
    responseApiKey || process.env["OPENAI_API_KEY"] || "",
    responseBaseURL || "https://api.openai.com/v1",
    responseModel.model
  );

  const intentLLMCaller = new ChatOpenAILLMCaller(
    intentApiKey || process.env["OPENAI_API_KEY"] || "",
    intentBaseURL || "https://api.openai.com/v1",
    intentModel.model
  );

  let turnResult;
  try {
    turnResult = await runChatCompletionTurn({
      conversationId,
      requestId,
      turnId,
      model: BERNARD_MODEL_ID,
      messages: mergedMessages,
      intentLLMCaller,
      responseLLMCaller,
      recordKeeper: keeper,
      includeUsage,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
    await keeper.completeRequest(requestId, latencyMs);
    return new NextResponse(
      JSON.stringify({ error: "Chat completion failed" }),
      { status: 500, headers: getCorsHeaders(null) }
    );
  }

  if (!shouldStream) {
    try {
      const messages = await turnResult.finalMessages;
      const assistantMessage = findLastAssistantMessage(messages);
      const content = contentFromMessage(assistantMessage) ?? "";
      const usageMeta = extractUsageFromMessages(messages);
      const usage =
        typeof usageMeta.prompt_tokens === "number" || typeof usageMeta.completion_tokens === "number"
          ? {
              prompt_tokens: usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0,
              completion_tokens: usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0,
              total_tokens:
                (usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0) +
                (usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0)
            }
          : undefined;

      const latencyMs = Date.now() - start;
      await keeper.endTurn(turnId, { status: "ok", latencyMs });
      await keeper.completeRequest(requestId, latencyMs);

      return NextResponse.json({
        id: requestId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: BERNARD_MODEL_ID,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content
            }
          }
        ],
        ...(usage ? { usage } : {})
      }, { headers: getCorsHeaders(null) });
    } catch (err) {
      const latencyMs = Date.now() - start;
      await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
      await keeper.completeRequest(requestId, latencyMs);
      return new NextResponse(
        JSON.stringify({ error: "Chat completion failed" }),
        { status: 500, headers: getCorsHeaders(null) }
      );
    }
  }

  // For streaming, we need to wrap the stream to record completion in keeper
  const wrappedStream = new ReadableStream({
    async start(controller) {
      const reader = turnResult.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
        
        const latencyMs = Date.now() - start;
        await keeper.endTurn(turnId, { status: "ok", latencyMs });
        await keeper.completeRequest(requestId, latencyMs);
      } catch (err) {
        const latencyMs = Date.now() - start;
        await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
        await keeper.completeRequest(requestId, latencyMs);
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    }
  });

  return new NextResponse(wrappedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
      ...getCorsHeaders(null)
    }
  });
}

