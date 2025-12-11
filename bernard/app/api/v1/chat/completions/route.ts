import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
import { buildGraph } from "@/lib/agent";
import type { BaseMessage } from "@langchain/core/messages";
import type { OpenAIMessage } from "@/lib/agent";
import { ChatOpenAI } from "@langchain/openai";
import { resolveApiKey, resolveBaseUrl, resolveModel, splitModelAndProvider } from "@/lib/config/models";

export const runtime = "nodejs";

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
    return new NextResponse(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), { status: 400 });
  }

  if (!body?.messages || !Array.isArray(body.messages)) {
    return new NextResponse(JSON.stringify({ error: "`messages` array is required" }), { status: 400 });
  }

  for (const key of UNSUPPORTED_KEYS) {
    if (body[key] !== undefined && body[key] !== null) {
      return new NextResponse(JSON.stringify({ error: `Unsupported parameter: ${key}` }), { status: 400 });
    }
  }

  if (body.n && body.n > 1) {
    return new NextResponse(JSON.stringify({ error: "`n>1` is not supported" }), { status: 400 });
  }

  if (!isBernardModel(body.model)) {
    return new NextResponse(JSON.stringify({ error: "Model not found", allowed: BERNARD_MODEL_ID }), { status: 404 });
  }

  const includeUsage = body.stream_options?.include_usage === true;
  const shouldStream = body.stream === true;
  const start = Date.now();

  let inputMessages: BaseMessage[];
  try {
    inputMessages = mapChatMessages(body.messages);
  } catch (err) {
    return new NextResponse(
      JSON.stringify({ error: "Invalid messages", reason: err instanceof Error ? err.message : String(err) }),
      { status: 400 }
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
  const intentLLM = new ChatOpenAI({
    model: intentModel.model,
    apiKey: intentApiKey,
    configuration: { baseURL: intentBaseURL },
    temperature: intentModelConfig.options?.temperature ?? 0,
    ...(intentModel.providerOnly ? { modelKwargs: { provider: { only: intentModel.providerOnly } } } : {})
  });

  const stop = Array.isArray(body.stop) ? body.stop : typeof body.stop === "string" ? [body.stop] : undefined;
  const responseModel = splitModelAndProvider(responseModelName);
  const responseApiKey = resolveApiKey(undefined, responseModelConfig.options);
  const responseBaseURL = resolveBaseUrl(undefined, responseModelConfig.options);
  const responseOptions: ConstructorParameters<typeof ChatOpenAI>[0] = {
    model: responseModel.model,
    apiKey: responseApiKey,
    configuration: { baseURL: responseBaseURL }
  };
  const configuredResponseOptions = responseModelConfig.options ?? {};
  if (typeof body.temperature === "number") responseOptions.temperature = body.temperature;
  else if (typeof configuredResponseOptions.temperature === "number") responseOptions.temperature = configuredResponseOptions.temperature;
  if (typeof body.top_p === "number") responseOptions.topP = body.top_p;
  else if (typeof configuredResponseOptions.topP === "number") responseOptions.topP = configuredResponseOptions.topP;
  if (typeof body.frequency_penalty === "number") responseOptions.frequencyPenalty = body.frequency_penalty;
  if (typeof body.presence_penalty === "number") responseOptions.presencePenalty = body.presence_penalty;
  if (typeof body.max_tokens === "number") responseOptions.maxTokens = body.max_tokens;
  else if (typeof configuredResponseOptions.maxTokens === "number") responseOptions.maxTokens = configuredResponseOptions.maxTokens;
  if (stop) responseOptions.stop = stop;
  if (body.logit_bias) responseOptions.logitBias = body.logit_bias;
  if (responseModel.providerOnly) responseOptions.modelKwargs = { provider: { only: responseModel.providerOnly } };

  const responseLLM = new ChatOpenAI(responseOptions);

  const graph = await buildGraph(
    {
      recordKeeper: keeper,
      turnId,
      conversationId,
      requestId,
      token: auth.token,
      model: responseModelName,
      responseModel: responseModelName,
      intentModel: intentModelName
    },
    { responseModel: responseLLM, intentModel: intentLLM }
  );

  if (!shouldStream) {
    try {
      const result = await graph.invoke({ messages: mergedMessages });
      const messages = result.messages ?? mergedMessages;
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
      });
    } catch (err) {
      const latencyMs = Date.now() - start;
      await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
      await keeper.completeRequest(requestId, latencyMs);
      return new NextResponse(
        JSON.stringify({ error: "Chat completion failed", reason: err instanceof Error ? err.message : String(err) }),
        { status: 500 }
      );
    }
  }

  let detailed;
  try {
    detailed = await graph.runWithDetails({ messages: mergedMessages });
  } catch (err) {
    const latencyMs = Date.now() - start;
    await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
    await keeper.completeRequest(requestId, latencyMs);
    return new NextResponse(
      JSON.stringify({ error: "Chat completion failed", reason: err instanceof Error ? err.message : String(err) }),
      { status: 500 }
    );
  }

  const responseMessages = [...detailed.transcript, detailed.response.message];
  const usageMeta = extractUsageFromMessages(responseMessages);
  const usage =
    typeof usageMeta.prompt_tokens === "number" ||
    typeof usageMeta.input_tokens === "number" ||
    typeof usageMeta.completion_tokens === "number" ||
    typeof usageMeta.output_tokens === "number"
      ? {
          prompt_tokens: usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0,
          completion_tokens: usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0,
          total_tokens:
            (usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0) +
            (usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0)
        }
      : undefined;

  const toolChunks = buildToolChunks(detailed.transcript, detailed.historyLength);
  const finalContent = contentFromMessage(detailed.response.message) ?? "";
  const contentChunks = chunkContent(finalContent);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendChunk = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: requestId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: BERNARD_MODEL_ID,
              ...payload
            })}\n\n`
          )
        );
      };

      const sendDelta = (delta: Record<string, unknown>, finish_reason: string | null = null) => {
        sendChunk({
          choices: [{ index: 0, delta, finish_reason }]
        });
      };

      sendDelta({ role: "assistant" });

      try {
        for (const chunk of toolChunks) {
          if (!chunk.tool_calls.length && !chunk.tool_outputs.length) continue;
          sendDelta(
            {
              ...(chunk.tool_calls.length ? { tool_calls: chunk.tool_calls } : {}),
              ...(chunk.tool_outputs.length ? { tool_outputs: chunk.tool_outputs } : {})
            },
            null
          );
        }

        for (const piece of contentChunks) {
          if (!piece) continue;
          sendDelta({ content: piece });
        }

        sendDelta({}, "stop");
        if (includeUsage && usage) {
          sendChunk({ choices: [], usage });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        const latencyMs = Date.now() - start;
        await keeper.endTurn(turnId, { status: "ok", latencyMs });
        await keeper.completeRequest(requestId, latencyMs);
      } catch (err) {
        const latencyMs = Date.now() - start;
        await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
        await keeper.completeRequest(requestId, latencyMs);
        sendChunk({
          error: "Chat completion stream failed",
          reason: err instanceof Error ? err.message : String(err)
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}


function chunkContent(content: string): string[] {
  if (!content) return [];
  const parts = content.split(/(\s+)/).filter((part) => part.length);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const next = current + part;
    if (next.length > 32 && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [content];
}

function buildToolChunks(transcript: BaseMessage[], historyLength: number) {
  const deltas = transcript.slice(historyLength);
  const chunks: Array<{
    tool_calls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_outputs: Array<{ id: string; content: string }>;
  }> = [];

  let pendingCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> | null =
    null;
  let outputs: Array<{ id: string; content: string }> = [];

  const flush = () => {
    if (pendingCalls || outputs.length) {
      chunks.push({
        tool_calls: pendingCalls ?? [],
        tool_outputs: outputs
      });
    }
    pendingCalls = null;
    outputs = [];
  };

  for (const message of deltas) {
    const calls = collectToolCalls([message]);
    if (calls.length) {
      flush();
      pendingCalls = calls;
      continue;
    }

    const type = (message as { _getType?: () => string })._getType?.();
    if (type === "tool") {
      const id =
        (message as { tool_call_id?: string }).tool_call_id ??
        (message as { name?: string }).name ??
        "tool_call";
      const content = contentFromMessage(message) ?? "";
      outputs.push({ id: String(id), content });
      continue;
    }

    if (pendingCalls || outputs.length) {
      flush();
    }
  }

  flush();
  return chunks.filter((chunk) => chunk.tool_calls.length || chunk.tool_outputs.length);
}

