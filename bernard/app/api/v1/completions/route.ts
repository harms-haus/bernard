import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  BERNARD_MODEL_ID,
  contentFromMessage,
  createScaffolding,
  extractMessagesFromChunk,
  extractUsageFromMessages,
  findLastAssistantMessage,
  hydrateMessagesWithHistory,
  mapCompletionPrompt,
  validateAuth
} from "@/app/api/v1/_lib/openai";
import { buildIntentLLM, buildResponseLLM } from "@/app/api/v1/_lib/openai/modelBuilders";
import {
  buildUsage,
  ensureBernardModel,
  finalizeTurn,
  normalizeStop,
  parseJsonBody,
  rejectUnsupportedKeys
} from "@/app/api/v1/_lib/openai/request";
import { buildRequestLogger } from "@/app/api/_lib/logging";
import { buildGraph } from "@/lib/agent";
import type { BaseMessage } from "@langchain/core/messages";
import { resolveModel } from "@/lib/config/models";

export const runtime = "nodejs";

export type CompletionBody = {
  model?: string;
  prompt?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  logit_bias?: Record<string, number>;
  stop?: string | string[] | null;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  // unsupported params
  n?: number;
  echo?: boolean;
  best_of?: number;
  user?: unknown;
};

const UNSUPPORTED: Array<keyof CompletionBody> = ["n", "echo", "best_of", "user"];

export async function POST(req: NextRequest) {
  const reqLog = buildRequestLogger(req, { route: "/api/v1/completions" });
  const auth = await validateAuth(req);
  if ("error" in auth) {
    reqLog.failure(auth.error.status ?? 401, "auth_failed");
    return auth.error;
  }

  const parsed = await parseJsonBody<CompletionBody>(req);
  if ("error" in parsed) {
    reqLog.failure(parsed.error.status ?? 400, "invalid_body");
    return parsed.error;
  }
  const body = parsed.ok;

  if (!body?.prompt || typeof body.prompt !== "string") {
    reqLog.failure(400, "missing_prompt");
    return new NextResponse(JSON.stringify({ error: "`prompt` is required" }), { status: 400 });
  }

  const unsupported = rejectUnsupportedKeys(body, UNSUPPORTED);
  if (unsupported) return unsupported;

  if (body.n && body.n > 1) {
    return new NextResponse(JSON.stringify({ error: "`n>1` is not supported" }), { status: 400 });
  }

  const modelError = ensureBernardModel(body.model);
  if (modelError) return modelError;

  const shouldStream = body.stream === true;
  const includeUsage = body.stream_options?.include_usage === true;
  const start = Date.now();

  let messages: BaseMessage[];
  try {
    messages = mapCompletionPrompt(body.prompt);
  } catch (err) {
    return new NextResponse(
      JSON.stringify({ error: "Failed to map prompt", reason: err instanceof Error ? err.message : String(err) }),
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
    ? messages
    : await hydrateMessagesWithHistory({
        keeper,
        conversationId,
        incoming: messages
      });
  const intentLLM = buildIntentLLM(intentModelConfig, responseModelConfig);

  const responseLLM = buildResponseLLM(responseModelConfig, { ...body, stop: normalizeStop(body.stop) });

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
    return runCompletionOnce({ graph, mergedMessages, keeper, turnId, requestId, start });
  }

  return streamCompletion({
    graph,
    mergedMessages,
    includeUsage,
    keeper,
    turnId,
    requestId,
    start
  });
}

type AgentGraph = Awaited<ReturnType<typeof buildGraph>>;

function usageFromMessages(messages: BaseMessage[]) {
  return buildUsage(extractUsageFromMessages(messages));
}

/**
 * Execute a completion request without streaming tokens.
 */
async function runCompletionOnce(opts: {
  graph: AgentGraph;
  mergedMessages: BaseMessage[];
  keeper: Awaited<ReturnType<typeof createScaffolding>>["keeper"];
  turnId: string;
  requestId: string;
  start: number;
}) {
  const { graph, mergedMessages, keeper, turnId, requestId, start } = opts;
  try {
    const result = await graph.invoke({ messages: mergedMessages });
    const allMessages = result.messages ?? mergedMessages;
    const assistant = findLastAssistantMessage(allMessages);
    const content = contentFromMessage(assistant) ?? "";
    const usage = usageFromMessages(allMessages);

    await finalizeTurn({ keeper, turnId, requestId, start, status: "ok" });

    return NextResponse.json({
      id: requestId,
      object: "text_completion",
      created: Math.floor(Date.now() / 1000),
      model: BERNARD_MODEL_ID,
      choices: [
        {
          index: 0,
          text: content,
          logprobs: null,
          finish_reason: "stop"
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
      JSON.stringify({ error: "Completion failed", reason: err instanceof Error ? err.message : String(err) }),
      { status: 500 }
    );
  }
}

/**
 * Stream completion output as SSE chunks.
 */
function streamCompletion(opts: {
  graph: AgentGraph;
  mergedMessages: BaseMessage[];
  includeUsage: boolean;
  keeper: Awaited<ReturnType<typeof createScaffolding>>["keeper"];
  turnId: string;
  requestId: string;
  start: number;
}) {
  const { graph, mergedMessages, includeUsage, keeper, turnId, requestId, start } = opts;
  const encoder = new TextEncoder();
  const iterator = graph.stream({ messages: mergedMessages });

  const stream = new ReadableStream({
    async start(controller) {
      let latestContent = "";
      let latestMessages: BaseMessage[] | null = null;

      const sendChunk = (choices: unknown) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: requestId,
              object: "text_completion",
              created: Math.floor(Date.now() / 1000),
              model: BERNARD_MODEL_ID,
              choices
            })}\n\n`
          )
        );
      };

      try {
        for await (const chunk of iterator) {
          const maybeMessages = extractMessagesFromChunk(chunk);
          if (!maybeMessages) continue;
          latestMessages = maybeMessages;

          const assistant = findLastAssistantMessage(maybeMessages);
          const content = contentFromMessage(assistant);
          if (content !== null) {
            const incremental =
              content.startsWith(latestContent) && content.length >= latestContent.length
                ? content.slice(latestContent.length)
                : content;
            if (incremental) {
              latestContent += incremental;
              sendChunk([{ index: 0, text: incremental, finish_reason: null }]);
            }
          }
        }

        sendChunk([{ index: 0, text: "", finish_reason: "stop" }]);

        if (includeUsage && latestMessages) {
          const usage = usageFromMessages(latestMessages);
          if (usage) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ usage })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        await finalizeTurn({ keeper, turnId, requestId, start, status: "ok" });
        reqLog.success(200, {
          action: "completion.stream",
          conversationId,
          requestId,
          turnId,
          stream: shouldStream,
          newConversation: isNewConversation
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
        reqLog.failure(500, err, {
          action: "completion.stream",
          conversationId,
          requestId,
          turnId
        });
        sendChunk([{ index: 0, text: "", finish_reason: "stop" }]);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: "Completion stream failed",
              reason: err instanceof Error ? err.message : String(err)
            })}\n\n`
          )
        );
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

