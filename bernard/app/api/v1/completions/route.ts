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
  hydrateMessagesWithHistory,
  validateAuth
} from "@/app/api/v1/_lib/openai";
import { buildGraph } from "@/lib/agent";
import type { BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { resolveApiKey, resolveBaseUrl, resolveModel, splitModelAndProvider } from "@/lib/models";

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
      const allMessages = result.messages ?? mergedMessages;
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
      const latencyMs = Date.now() - start;
      await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
      await keeper.completeRequest(requestId, latencyMs);
      return new NextResponse(
        JSON.stringify({ error: "Completion failed", reason: err instanceof Error ? err.message : String(err) }),
        { status: 500 }
      );
    }
  }

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
        const latencyMs = Date.now() - start;
        await keeper.endTurn(turnId, { status: "error", latencyMs, errorType: err instanceof Error ? err.name : "error" });
        await keeper.completeRequest(requestId, latencyMs);
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

