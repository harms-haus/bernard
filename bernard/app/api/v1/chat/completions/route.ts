import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  BERNARD_MODEL_ID,
  collectToolCalls,
  contentFromMessage,
  createScaffolding,
  extractMessagesFromChunk,
  extractUsageFromMessages,
  findLastAssistantMessage,
  isBernardModel,
  mapChatMessages,
  safeStringify,
  summarizeToolOutputs,
  validateAuth
} from "@/app/api/v1/_lib/openai";
import { buildGraph } from "@/lib/agent";
import type { BaseMessage } from "@langchain/core/messages";
import type { OpenAIMessage } from "@/lib/agent";
import { ChatOpenAI } from "@langchain/openai";
import { getPrimaryModel, resolveApiKey, resolveBaseUrl } from "@/lib/models";

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

  const scaffold = await createScaffolding({ token: auth.token, responseModelOverride: getPrimaryModel("response") });
  const { keeper, conversationId, requestId, turnId, responseModelName, intentModelName } = scaffold;

  const apiKey = resolveApiKey();
  const baseURL = resolveBaseUrl();

  const intentLLM = new ChatOpenAI({
    model: intentModelName,
    apiKey,
    configuration: { baseURL },
    temperature: 0
  });

  const stop = Array.isArray(body.stop) ? body.stop : typeof body.stop === "string" ? [body.stop] : undefined;
  const responseOptions: ConstructorParameters<typeof ChatOpenAI>[0] = {
    model: responseModelName,
    apiKey,
    configuration: { baseURL }
  };
  if (typeof body.temperature === "number") responseOptions.temperature = body.temperature;
  if (typeof body.top_p === "number") responseOptions.topP = body.top_p;
  if (typeof body.frequency_penalty === "number") responseOptions.frequencyPenalty = body.frequency_penalty;
  if (typeof body.presence_penalty === "number") responseOptions.presencePenalty = body.presence_penalty;
  if (typeof body.max_tokens === "number") responseOptions.maxTokens = body.max_tokens;
  if (stop) responseOptions.stop = stop;
  if (body.logit_bias) responseOptions.logitBias = body.logit_bias;

  const responseLLM = new ChatOpenAI(responseOptions);

  const graph = buildGraph(
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
      const result = await graph.invoke({ messages: inputMessages });
      const messages = result.messages ?? inputMessages;
      const toolOutputs = summarizeToolOutputs(messages);
      const toolCalls = collectToolCalls(messages);
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
              content,
              ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
              ...(toolOutputs.length ? { tool_outputs: toolOutputs } : {})
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

  const encoder = new TextEncoder();
  const iterator = graph.stream({ messages: inputMessages });
  const stream = new ReadableStream({
    async start(controller) {
      const sentToolCalls = new Set<string>();
      let latestMessages: BaseMessage[] | null = null;
      let streamedContent = "";
      let usageChunk: Record<string, unknown> | null = null;

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

      // initial assistant role
      sendDelta({ role: "assistant" });

      try {
        for await (const chunk of iterator) {
          const maybeMessages = extractMessagesFromChunk(chunk);
          if (!maybeMessages) continue;
          latestMessages = maybeMessages;

          // tool calls
          for (const message of maybeMessages) {
            if ((message as { tool_calls?: unknown[] }).tool_calls) {
              const tc = (message as { tool_calls?: unknown[] }).tool_calls;
              if (Array.isArray(tc)) {
                const newCalls = tc
                  .map((call) => {
                    const fn = (call as { function?: { name?: string; arguments?: unknown } }).function;
                    const id = (call as { id?: string }).id ?? fn?.name ?? "tool_call";
                    if (sentToolCalls.has(String(id))) return null;
                    sentToolCalls.add(String(id));
                    return {
                      id: String(id),
                      type: "function",
                      function: {
                        name: String(fn?.name ?? "tool_call"),
                        arguments: safeStringify(fn?.arguments ?? "")
                      }
                    };
                  })
                  .filter(Boolean);
                if (newCalls.length) {
                  sendDelta({ tool_calls: newCalls as unknown[] });
                }
              }
            }
          }

          // assistant content
          const responseMessage = findLastAssistantMessage(maybeMessages);
          const content = contentFromMessage(responseMessage);
          if (content !== null) {
            const incremental =
              content.startsWith(streamedContent) && content.length >= streamedContent.length
                ? content.slice(streamedContent.length)
                : content;
            if (incremental) {
              streamedContent += incremental;
              sendDelta({ content: incremental });
            }
          }
        }

        if (latestMessages) {
          const usageMeta = extractUsageFromMessages(latestMessages);
          if (
            typeof usageMeta.prompt_tokens === "number" ||
            typeof usageMeta.input_tokens === "number" ||
            typeof usageMeta.completion_tokens === "number" ||
            typeof usageMeta.output_tokens === "number"
          ) {
            usageChunk = {
              usage: {
                prompt_tokens: usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0,
                completion_tokens: usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0,
                total_tokens:
                  (usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0) +
                  (usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0)
              }
            };
          }
        }

        sendDelta({}, "stop");
        if (includeUsage && usageChunk) {
          sendChunk({ choices: [], ...usageChunk });
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

