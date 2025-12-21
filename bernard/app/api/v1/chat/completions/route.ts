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
import { getSettings } from "@/lib/config/settingsCache";
import { StreamingOrchestrator } from "@/agent/loop/orchestrator";
import { transformAgentOutputToChunks } from "@/agent/streaming/transform";
import { createSSEStream } from "@/agent/streaming/sse";
import { createLLMCaller } from "@/agent/llm/factory";
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
  chatId?: string;
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
  const routerModelConfig = await resolveModel("router", { fallback: [responseModelConfig.id] });

  const scaffold = await createScaffolding({
    token: auth.token,
    responseModelOverride: responseModelConfig.id,
    ...(body.chatId ? { conversationId: body.chatId } : {})
  });
  const {
    keeper,
    conversationId,
    requestId,
    turnId,
    responseModelName: scaffoldResponseModel,
    routerModelName: scaffoldrouterModel,
    isNewConversation
  } = scaffold;
  const responseModelName = scaffoldResponseModel ?? responseModelConfig.id;
  const routerModelName = scaffoldrouterModel ?? routerModelConfig.id;

  const mergedMessages = inputMessages;

  const routerModel = splitModelAndProvider(routerModelName);
  const responseModel = splitModelAndProvider(responseModelName);

  // Get provider information from settings
  const settings = await getSettings();

  // Get the router provider from model settings
  const routerModelSettings = settings.models.router;
  const routerProvider = settings.models.providers?.find(p => p.id === routerModelSettings.providerId);

  // Get the response provider from model settings
  const responseModelSettings = settings.models.response;
  const responseProvider = settings.models.providers?.find(p => p.id === responseModelSettings.providerId);

  if (!routerProvider) {
    return new NextResponse(JSON.stringify({ error: "Router provider not found" }), { status: 500, headers: getCorsHeaders(null) });
  }
  if (!responseProvider) {
    return new NextResponse(JSON.stringify({ error: "Response provider not found" }), { status: 500, headers: getCorsHeaders(null) });
  }

  const routerLLMCaller = createLLMCaller(routerProvider, routerModel.model);
  const responseLLMCaller = createLLMCaller(responseProvider, responseModel.model);

  const orchestrator = new StreamingOrchestrator(
    keeper,
    routerLLMCaller,
    responseLLMCaller
  );

  const turnResult = await orchestrator.run({
    conversationId,
    incoming: mergedMessages,
    persistable: inputMessages,
    requestId,
    turnId,
    trace: true // Enable trace by default
  });

  if (!shouldStream) {
    try {
      const { finalMessages } = await turnResult.result;
      const assistantMessage = findLastAssistantMessage(finalMessages);
      const content = contentFromMessage(assistantMessage) ?? "";
      const usageMeta = extractUsageFromMessages(finalMessages);
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

  // Streaming response
  const chunks = transformAgentOutputToChunks(turnResult.stream, {
    model: BERNARD_MODEL_ID,
    requestId,
    conversationId
  });

  const sseStream = createSSEStream(chunks);

  // Wrap the stream to record completion in keeper
  const responseStream = new ReadableStream({
    async start(controller) {
      const reader = sseStream.getReader();
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

  return new NextResponse(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
      ...getCorsHeaders(null)
    }
  });
}

