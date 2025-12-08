import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  BERNARD_MODEL_ID,
  contentFromMessage,
  createScaffolding,
  extractMessagesFromChunk,
  extractUsageFromMessages,
  findLastAssistantMessage,
  isBernardModel,
  mapCompletionPrompt,
  validateAuth
} from "@/app/api/v1/_lib/openai";
import { buildGraph } from "@/lib/agent";
import type { BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { getPrimaryModel, resolveApiKey, resolveBaseUrl } from "@/lib/models";

export const runtime = "nodejs";

type CompletionBody = {
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
  const auth = await validateAuth(req);
  if ("error" in auth) return auth.error;

  let body: CompletionBody | null = null;
  try {
    body = (await req.json()) as CompletionBody;
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), { status: 400 });
  }

  if (!body?.prompt || typeof body.prompt !== "string") {
    return new NextResponse(JSON.stringify({ error: "`prompt` is required" }), { status: 400 });
  }

  for (const key of UNSUPPORTED) {
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

  const responseLLM = new ChatOpenAI({
    model: responseModelName,
    apiKey,
    configuration: { baseURL },
    temperature: body.temperature,
    topP: body.top_p,
    frequencyPenalty: body.frequency_penalty,
    presencePenalty: body.presence_penalty,
    maxTokens: body.max_tokens,
    stop: body.stop ?? undefined,
    logitBias: body.logit_bias
  });

  const graph = buildGraph(
    {
      recordKeeper: keeper,
      turnId,
      conversationId,
      requestId,
      token: auth.token,
      model: responseModelName,
      responseModel: responseLLM,
      intentModel: intentLLM
    },
    {}
  );

  if (!shouldStream) {
    try {
      const result = await graph.invoke({ messages });
      const allMessages = result.messages ?? messages;
      const assistant = findLastAssistantMessage(allMessages);
      const content = contentFromMessage(assistant) ?? "";
      const usageMeta = extractUsageFromMessages(allMessages);
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
      await keeper.endTurn(turnId, { status: "error", errorType: err instanceof Error ? err.name : "error" });
      return new NextResponse(
        JSON.stringify({ error: "Completion failed", reason: err instanceof Error ? err.message : String(err) }),
        { status: 500 }
      );
    }
  }

  const encoder = new TextEncoder();
  const iterator = graph.stream({ messages }, { streamMode: "updates" as const });

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
          const meta = extractUsageFromMessages(latestMessages);
          if (
            typeof meta.prompt_tokens === "number" ||
            typeof meta.input_tokens === "number" ||
            typeof meta.completion_tokens === "number" ||
            typeof meta.output_tokens === "number"
          ) {
            const usage = {
              prompt_tokens: meta.prompt_tokens ?? meta.input_tokens ?? 0,
              completion_tokens: meta.completion_tokens ?? meta.output_tokens ?? 0,
              total_tokens:
                (meta.prompt_tokens ?? meta.input_tokens ?? 0) + (meta.completion_tokens ?? meta.output_tokens ?? 0)
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ usage })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        const latencyMs = Date.now() - start;
        await keeper.endTurn(turnId, { status: "ok", latencyMs });
        await keeper.completeRequest(requestId, latencyMs);
      } catch (err) {
        await keeper.endTurn(turnId, { status: "error", errorType: err instanceof Error ? err.name : "error" });
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

