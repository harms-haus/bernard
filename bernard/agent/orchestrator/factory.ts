import { ChatOpenAI } from "@langchain/openai";

import { resolveApiKey, resolveBaseUrl, resolveModel, splitModelAndProvider, type ModelCallOptions } from "@/lib/models";
import { contentFromMessage, extractTokenUsage } from "@/lib/messages";
import type { RecordKeeper } from "@/lib/recordKeeper";
import { intentTools } from "../harness/intent/tools";
import { IntentHarness } from "../harness/intent/intent.harness";
import { MemoryHarness } from "../harness/memory/memory.harness";
import { ResponseHarness } from "../harness/respond/respond.harness";
import { UtilityHarness } from "../harness/utility/utility.harness";
import type { HarnessConfig, LLMCallConfig, LLMCaller, LLMResponse, ToolCall } from "../harness/lib/types";
import { buildHarnessConfig, type OrchestratorConfigInput } from "./config";
import { Orchestrator } from "./orchestrator";
import { snapshotToolsForTrace } from "../harness/lib/toolSnapshot";

function toToolCalls(raw: unknown): ToolCall[] {
  const toolCalls = (raw as { tool_calls?: unknown[] } | undefined)?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .map((call) => {
      const id = (call as { id?: unknown }).id ?? "tool_call";
      const fn = (call as { function?: { name?: string; arguments?: unknown; args?: unknown; input?: unknown } }).function;
      const name = fn?.name ?? (call as { name?: string }).name ?? "tool_call";
      const args =
        fn?.arguments ??
        fn?.args ??
        fn?.input ??
        (call as { arguments?: unknown }).arguments ??
        (call as { args?: unknown }).args ??
        (call as { input?: unknown }).input ??
        (call as { parameters?: unknown }).parameters;
      return {
        id: String(id),
        name: String(name),
        type: (call as { type?: unknown }).type ? String((call as { type?: unknown }).type) : undefined,
        arguments: args,
        args,
        input: args,
        function: fn
      } satisfies ToolCall;
    })
    .filter(Boolean);
}

type CallerOpts = {
  maxTokens?: number;
  callOptions?: ModelCallOptions;
};

class ChatModelCaller implements LLMCaller {
  constructor(private readonly modelName: string, private readonly client: ChatOpenAI) {}

  async call(input: LLMCallConfig): Promise<LLMResponse> {
    const bound = input.tools ? this.client.bindTools(input.tools) : this.client;
    const timeoutMs = 10_000; // cap total call time to 10s
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    let message;
    try {
      message = await bound.invoke(input.messages, { signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`LLM call timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const latency = Date.now() - started;
    const usage = extractTokenUsage(message);
    const text = contentFromMessage(message) ?? "";
    const response: LLMResponse = {
      text,
      message,
      toolCalls: toToolCalls(message),
      raw: message,
      usage: {
        in: usage.prompt_tokens ?? usage.input_tokens,
        out: usage.completion_tokens ?? usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens,
        cacheWrite: usage.cache_creation_input_tokens ?? usage.cache_write_input_tokens,
        cached: usage.cached
      },
      trace: { model: this.modelName, latencyMs: latency, startedAt }
    };

    const meta = input.meta;
    const shouldRecord = meta?.recordKeeper && meta.conversationId && !meta?.deferRecord;
    if (shouldRecord) {
      await meta.recordKeeper.recordLLMCall(meta.conversationId, {
        model: input.model ?? this.modelName,
        context: input.messages,
        result: message,
        startedAt,
        latencyMs: latency,
        tools: snapshotToolsForTrace(input.tools),
        tokens: response.usage,
        requestId: meta.requestId,
        turnId: meta.turnId,
        stage: meta.traceName,
        contextLimit: 12,
        contentPreviewChars: null
      });
    }

    return response;
  }
}

function makeCaller(model: string, temperature: number, opts: CallerOpts = {}) {
  const apiKey = resolveApiKey(undefined, opts.callOptions);
  const baseURL = resolveBaseUrl(undefined, opts.callOptions);
  const parsedModel = splitModelAndProvider(model);
  const client = new ChatOpenAI({
    model: parsedModel.model,
    apiKey,
    configuration: { baseURL },
    temperature: opts.callOptions?.temperature ?? temperature,
    topP: opts.callOptions?.topP,
    maxTokens: opts.callOptions?.maxTokens ?? opts.maxTokens,
    ...(parsedModel.providerOnly ? { modelKwargs: { provider: { only: parsedModel.providerOnly } } } : {})
  });
  return new ChatModelCaller(model, client);
}

export async function createOrchestrator(
  recordKeeper: RecordKeeper | null,
  opts: OrchestratorConfigInput = {}
): Promise<{ orchestrator: Orchestrator; config: HarnessConfig }> {
  const config = await buildHarnessConfig(opts);
  const [intentResolved, responseResolved] = await Promise.all([
    resolveModel("intent", { override: config.intentModel }),
    resolveModel("response", { override: config.responseModel })
  ]);

  const intentCaller = makeCaller(config.intentModel, 0, {
    maxTokens: 750,
    callOptions: intentResolved.options
  }); // cap intent to ~750 out tokens
  const responseCaller = makeCaller(config.responseModel, 0.5, {
    maxTokens: opts.responseCallerOptions?.maxTokens,
    callOptions: responseResolved.options
  });

  const intentHarness = new IntentHarness(intentCaller, intentTools, config.maxIntentIterations ?? 4);
  const memoryHarness = new MemoryHarness();
  const responseHarness = new ResponseHarness(responseCaller);
  const utilityHarness = new UtilityHarness();

  const orchestrator = new Orchestrator(recordKeeper, config, intentHarness, memoryHarness, responseHarness, utilityHarness);
  return { orchestrator, config };
}


