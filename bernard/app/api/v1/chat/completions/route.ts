import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  BERNARD_MODEL_ID,
  contentFromMessage,
  createScaffolding,
  extractUsageFromMessages,
  findLastAssistantMessage,
  hydrateMessagesWithHistory,
  mapChatMessages,
  validateAuth
} from "@/app/api/v1/_lib/openai";
import type { StreamEvent } from "@/agent/harness/lib/types";
import { chunkContent, buildToolChunks } from "@/app/api/v1/_lib/openai/chatChunks";
import { buildIntentLLM, buildResponseLLM } from "@/app/api/v1/_lib/openai/modelBuilders";
import {
  buildUsage,
  ensureBernardModel,
  finalizeTurn,
  normalizeStop,
  parseJsonBody,
  rejectUnsupportedKeys
} from "@/app/api/v1/_lib/openai/request";
import { buildGraph } from "@/lib/agent";
import type { BaseMessage } from "@langchain/core/messages";
import type { OpenAIMessage } from "@/lib/agent";
import { resolveModel } from "@/lib/config/models";
import { HomeAssistantContextManager } from "@/agent/harness/intent/tools/ha-context";

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
  user?: string;
  // unsupported but may appear; reject when present
  n?: number;
  tools?: unknown;
  response_format?: unknown;
  prediction?: unknown;
  service_tier?: unknown;
  store?: unknown;
  seed?: unknown;
};

const UNSUPPORTED_KEYS: Array<keyof ChatCompletionBody> = [
  "n",
  "response_format",
  "prediction",
  "service_tier",
  "store",
  "seed"
];

export async function POST(req: NextRequest) {
  const auth = await validateAuth(req);
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody<ChatCompletionBody>(req);
  if ("error" in parsed) return parsed.error;
  const body = parsed.ok;

  if (!body?.messages || !Array.isArray(body.messages)) {
    return new NextResponse(JSON.stringify({ error: "`messages` array is required" }), { status: 400 });
  }

  const unsupported = rejectUnsupportedKeys(body, UNSUPPORTED_KEYS);
  if (unsupported) return unsupported;

  if (body.n && body.n > 1) {
    return new NextResponse(JSON.stringify({ error: "`n>1` is not supported" }), { status: 400 });
  }

  const modelError = ensureBernardModel(body.model);
  if (modelError) return modelError;

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

  const scaffold = await createScaffolding({ 
    token: auth.token, 
    responseModelOverride: responseModelConfig.id,
    userId: body.user
  });
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

  const intentLLM = buildIntentLLM(intentModelConfig, responseModelConfig);
  const responseLLM = buildResponseLLM(responseModelConfig, { ...body, stop: normalizeStop(body.stop) });

  const haContextManager = new HomeAssistantContextManager();
  haContextManager.updateFromMessages(mergedMessages);

  const graph = await buildGraph(
    {
      recordKeeper: keeper,
      turnId,
      conversationId,
      requestId,
      token: auth.token,
      model: responseModelName,
      responseModel: responseModelName,
      intentModel: intentModelName,
      haContextManager
    },
    { responseModel: responseLLM, intentModel: intentLLM }
  );

  if (!shouldStream) {
    return runChatCompletionOnce({ graph, mergedMessages, keeper, turnId, requestId, start, haContextManager });
  }

  return streamChatCompletion({
    graph,
    mergedMessages,
    includeUsage,
    keeper,
    turnId,
    requestId,
    start,
    haContextManager
  });
}

type AgentGraph = Awaited<ReturnType<typeof buildGraph>>;

function usageFromMessages(messages: BaseMessage[]) {
  return buildUsage(extractUsageFromMessages(messages));
}

/**
 * Build Home Assistant service calls for response
 */
function buildHAServiceCallsForResponse(haContextManager: HomeAssistantContextManager): Array<{
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}> {
  const serviceCalls = haContextManager.getRecordedServiceCalls();
  
  if (serviceCalls.length === 0) {
    return [];
  }
  
  return serviceCalls.map((call, index) => ({
    id: `ha_service_call_${index}`,
    type: "function",
    function: {
      name: "execute_services",
      arguments: JSON.stringify({
        list: [call]
      })
    }
  }));
}

/**
 * Execute a chat completion without streaming output.
 */
async function runChatCompletionOnce(opts: {
  graph: AgentGraph;
  mergedMessages: BaseMessage[];
  keeper: Awaited<ReturnType<typeof createScaffolding>>["keeper"];
  turnId: string;
  requestId: string;
  start: number;
  haContextManager: HomeAssistantContextManager;
}) {
  const { graph, mergedMessages, keeper, turnId, requestId, start, haContextManager } = opts;
  try {
    const result = await graph.invoke({ messages: mergedMessages });
    const messages = result.messages ?? mergedMessages;
    const assistantMessage = findLastAssistantMessage(messages);
    const content = contentFromMessage(assistantMessage) ?? "";
    const usage = usageFromMessages(messages);

    await finalizeTurn({ keeper, turnId, requestId, start, status: "ok" });

    const haServiceCalls = buildHAServiceCallsForResponse(haContextManager);

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
            ...(haServiceCalls.length ? { tool_calls: haServiceCalls } : {})
          }
        }
      ],
      ...(usage ? { usage } : {})
    });
  } catch (err) {
    await finalizeTurn({
      keeper,
      turnId,
      requestId,
      start,
      status: "error",
      errorType: err instanceof Error ? err.name : "error"
    });
    return new NextResponse(
      JSON.stringify({ error: "Chat completion failed", reason: err instanceof Error ? err.message : String(err) }),
      { status: 500 }
    );
  }
}

/**
 * Stream a chat completion with incremental deltas and optional usage.
 */
async function streamChatCompletion(opts: {
  graph: AgentGraph;
  mergedMessages: BaseMessage[];
  includeUsage: boolean;
  keeper: Awaited<ReturnType<typeof createScaffolding>>["keeper"];
  turnId: string;
  requestId: string;
  start: number;
  haContextManager: HomeAssistantContextManager;
}) {
   const { graph, mergedMessages, includeUsage, keeper, turnId, requestId, start, haContextManager } = opts;
  let detailed;
  const streamEvents: StreamEvent[] = [];
  try {
    // Collect streaming events from intent phase
    detailed = await graph.runWithDetails({ messages: mergedMessages }, (event) => {
      streamEvents.push(event);
    });
  } catch (err) {
    await finalizeTurn({
      keeper,
      turnId,
      requestId,
      start,
      status: "error",
      errorType: err instanceof Error ? err.name : "error"
    });
    return new NextResponse(
      JSON.stringify({ error: "Chat completion failed", reason: err instanceof Error ? err.message : String(err) }),
      { status: 500 }
    );
  }

  const responseMessages = [...detailed.transcript, detailed.response.message];
  const usage = usageFromMessages(responseMessages);
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
        // Send Home Assistant service calls first if any
        const haServiceCalls = buildHAServiceCallsForResponse(haContextManager);
        if (haServiceCalls.length) {
          sendDelta(
            {
              tool_calls: haServiceCalls
            },
            null
          );
        }

        // Stream intent phase tool calls and responses as they happened
        // Stream LLM call events
        for (const event of streamEvents) {
          if (event.type === "llm_call_start" && event.llmCallStart) {
            sendDelta(
              {
                content: `LLM Call Start: ${event.llmCallStart.model} (${event.llmCallStart.stage})`
              },
              null
            );
          } else if (event.type === "llm_call_chunk" && event.llmCallChunk) {
            sendDelta(
              {
                content: event.llmCallChunk.content
              },
              null
            );
          } else if (event.type === "llm_call_complete" && event.llmCallComplete) {
            sendDelta(
              {
                content: `LLM Call Complete: ${event.llmCallComplete.model} (${event.llmCallComplete.stage})`
              },
              null
            );
          }
        }
        for (const event of streamEvents) {
          if (event.type === "tool_call" && event.toolCall) {
            sendDelta(
              {
                tool_calls: [{
                  id: event.toolCall.id,
                  type: "function",
                  function: {
                    name: event.toolCall.name,
                    arguments: typeof event.toolCall.arguments === "string" ? event.toolCall.arguments : JSON.stringify(event.toolCall.arguments)
                  }
                }]
              },
              null
            );
          } else if (event.type === "tool_response" && event.toolResponse) {
            sendDelta(
              {
                tool_outputs: [{
                  id: event.toolResponse.toolCallId,
                  content: event.toolResponse.content
                }]
              },
              null
            );
          }
        }

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
        await finalizeTurn({ keeper, turnId, requestId, start, status: "ok" });
      } catch (err) {
        await finalizeTurn({
          keeper,
          turnId,
          requestId,
          start,
          status: "error",
          errorType: err instanceof Error ? err.name : "error"
        });
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
