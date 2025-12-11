import { ChatOpenAI } from "@langchain/openai";

import {
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
  splitModelAndProvider,
  type ModelCallOptions
} from "@/lib/config/models";
import { contentFromMessage, extractTokenUsage } from "@/lib/conversation/messages";
import type { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { intentTools } from "../harness/intent/tools";
import { IntentHarness } from "../harness/intent/intent.harness";
import { MemoryHarness } from "../harness/memory/memory.harness";
import { ResponseHarness } from "../harness/respond/respond.harness";
import { UtilityHarness } from "../harness/utility/utility.harness";
import type { HarnessConfig, LLMCallConfig, LLMCaller, LLMResponse, ToolCall } from "../harness/lib/types";
import { buildHarnessConfig, type OrchestratorConfigInput } from "./config";
import { Orchestrator } from "./orchestrator";
import { snapshotToolsForTrace } from "../harness/lib/toolSnapshot";

const DEFAULT_LLM_TIMEOUT_MS = 10_000;

/**
 * Normalizes mixed LangChain/OpenAI tool call shapes into the ToolCall contract.
 */
export function toToolCalls(raw: unknown): ToolCall[] {
  const toolCalls = (raw as { tool_calls?: unknown[] } | undefined)?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .map((call) => {
      const id = (call as { id?: unknown }).id ?? "tool_call";
      const fn = (call as { function?: { name?: string; arguments?: unknown; args?: unknown; input?: unknown } }).function;
      const name = fn?.name ?? (call as { name?: string }).name ?? "tool_call";
      const typeValue = (call as { type?: unknown }).type;
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
        arguments: args,
        ...(typeValue ? { type: String(typeValue) } : {}),
        ...(args !== undefined ? { args, input: args } : {}),
        ...(fn ? { function: fn } : {})
      } satisfies ToolCall;
    })
    .filter(Boolean);
}

type CallerOpts = {
  maxTokens?: number;
  callOptions?: ModelCallOptions;
};

type ChatClient = {
  bindTools(tools?: unknown[]): ChatClient;
  invoke(messages: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
};

/**
 * LLM caller that wraps ChatOpenAI with timeouts, tracing, and persistence.
 */
export class ChatModelCaller implements LLMCaller {
  constructor(
    private readonly modelName: string,
    private readonly client: ChatClient,
    private readonly timeoutMs: number = DEFAULT_LLM_TIMEOUT_MS
  ) {}

  async call(input: LLMCallConfig): Promise<LLMResponse> {
    const boundClient = this.bindClient(input);
    const startedAt = new Date().toISOString();
    const started = Date.parse(startedAt);
    const { controller, timer } = this.createAbortController();
    try {
      const message = await this.invokeWithTimeout(boundClient, input, controller);
      const response = this.buildResponse(message, started, startedAt);
      await this.recordIfNeeded(input, response, startedAt, Date.now() - started);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  private bindClient(input: LLMCallConfig) {
    return input.tools ? this.client.bindTools(input.tools) : this.client;
  }

  private createAbortController() {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`LLM call timed out after ${this.timeoutMs}ms`)),
      this.timeoutMs
    );
    return { controller, timer };
  }

  private async invokeWithTimeout(bound: ChatClient, input: LLMCallConfig, controller: AbortController) {
    try {
      return await bound.invoke(input.messages, { signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`LLM call timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
  }

  private buildResponse(message: unknown, started: number, startedAt: string): LLMResponse {
    const latency = Date.now() - started;
    const usage = extractTokenUsage(message);
    const text = contentFromMessage(message as any) ?? "";
    const usageDetails: LLMResponse["usage"] = {};
    const inTokens = usage.prompt_tokens ?? usage.input_tokens;
    const outTokens = usage.completion_tokens ?? usage.output_tokens;
    const cacheRead = usage.cache_read_input_tokens;
    const cacheWrite = usage.cache_creation_input_tokens ?? usage.cache_write_input_tokens;
    if (inTokens !== undefined) usageDetails.in = inTokens;
    if (outTokens !== undefined) usageDetails.out = outTokens;
    if (cacheRead !== undefined) usageDetails.cacheRead = cacheRead;
    if (cacheWrite !== undefined) usageDetails.cacheWrite = cacheWrite;
    if (usage.cached !== undefined) usageDetails.cached = usage.cached;

    return {
      text,
      message: message as LLMResponse["message"],
      toolCalls: toToolCalls(message),
      raw: message,
      usage: usageDetails,
      trace: { model: this.modelName, latencyMs: latency, startedAt }
    };
  }

  private async recordIfNeeded(input: LLMCallConfig, response: LLMResponse, startedAt: string, latency: number) {
    const meta = input.meta;
    const recordKeeper = meta?.recordKeeper;
    const conversationId = meta?.conversationId;
    const shouldRecord = recordKeeper && conversationId && !meta?.deferRecord;
    if (!shouldRecord || !recordKeeper || !conversationId) return;

    const tokens = response.usage;
    const requestId = meta.requestId;
    const turnId = meta.turnId;
    const stage = meta.traceName;
    const recordPayload = {
      model: input.model ?? this.modelName,
      context: input.messages,
      result: response.message,
      startedAt,
      latencyMs: latency,
      tools: snapshotToolsForTrace(input.tools),
      contextLimit: 12,
      ...(tokens ? { tokens } : {}),
      ...(requestId ? { requestId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(stage ? { stage } : {})
    };

    await recordKeeper.recordLLMCall(
      conversationId,
      recordPayload
    );
  }
}

function buildChatClient(model: string, temperature: number, opts: CallerOpts = {}) {
  const apiKey = resolveApiKey(undefined, opts.callOptions);
  const baseURL = resolveBaseUrl(undefined, opts.callOptions);
  const parsedModel = splitModelAndProvider(model);
  const options: ConstructorParameters<typeof ChatOpenAI>[0] = {
    model: parsedModel.model,
    configuration: { baseURL },
    temperature: opts.callOptions?.temperature ?? temperature,
    ...(parsedModel.providerOnly ? { modelKwargs: { provider: { only: parsedModel.providerOnly } } } : {}),
    ...(apiKey ? { apiKey } : {})
  };

  const topP = opts.callOptions?.topP;
  if (topP !== undefined) options.topP = topP;

  const maxTokens = opts.callOptions?.maxTokens ?? opts.maxTokens;
  if (maxTokens !== undefined) options.maxTokens = maxTokens;

  const client = new ChatOpenAI(options);
  return client as unknown as ChatClient;
}

/**
 * Creates a model caller with bounded output and provider configuration.
 */
export function makeCaller(model: string, temperature: number, opts: CallerOpts = {}, client?: ChatClient) {
  const chatClient = client ?? buildChatClient(model, temperature, opts);
  return new ChatModelCaller(model, chatClient);
}

/**
 * Builds and wires the orchestrator with configured harnesses.
 */
export async function createOrchestrator(
  recordKeeper: RecordKeeper | null,
  opts: OrchestratorConfigInput = {},
  deps: {
    buildConfig?: typeof buildHarnessConfig;
    resolveModelFn?: typeof resolveModel;
    makeCallerFn?: typeof makeCaller;
  } = {}
): Promise<{ orchestrator: Orchestrator; config: HarnessConfig }> {
  const buildConfig = deps.buildConfig ?? buildHarnessConfig;
  const resolveModelFn = deps.resolveModelFn ?? resolveModel;
  const makeCallerFn = deps.makeCallerFn ?? makeCaller;

  const config = await buildConfig(opts);
  const [intentResolved, responseResolved] = await Promise.all([
    resolveModelFn("intent", { override: config.intentModel }),
    resolveModelFn("response", { override: config.responseModel })
  ]);

  const intentCallOptions = intentResolved.options;
  const intentCaller = makeCallerFn(config.intentModel, 0, {
    maxTokens: 750,
    ...(intentCallOptions ? { callOptions: intentCallOptions } : {})
  }); // cap intent to ~750 out tokens

  const responseCallOptions = responseResolved.options;
  const responseCallerOpts: CallerOpts = {};
  const responseMaxTokens = opts.responseCallerOptions?.maxTokens;
  if (responseMaxTokens !== undefined) responseCallerOpts.maxTokens = responseMaxTokens;
  if (responseCallOptions) responseCallerOpts.callOptions = responseCallOptions;
  const responseCaller = makeCallerFn(config.responseModel, 0.5, responseCallerOpts);

  const intentHarness = new IntentHarness(intentCaller, intentTools, config.maxIntentIterations ?? 4);
  const memoryHarness = new MemoryHarness();
  const responseHarness = new ResponseHarness(responseCaller);
  const utilityHarness = new UtilityHarness();

  const orchestrator = new Orchestrator(recordKeeper, config, intentHarness, memoryHarness, responseHarness, utilityHarness);
  return { orchestrator, config };
}


