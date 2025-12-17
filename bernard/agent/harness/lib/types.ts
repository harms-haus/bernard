import type { BaseMessage } from "@langchain/core/messages";

export type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
  type?: string;
  args?: unknown;
  input?: unknown;
  function?: { name?: string; arguments?: unknown; args?: unknown; input?: unknown };
};

export type LLMCallConfig = {
  model: string;
  messages: BaseMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: unknown[];
  meta?: {
    conversationId?: string;
    requestId?: string;
    turnId?: string;
    recordKeeper?: import("@/lib/conversation/recordKeeper").RecordKeeper;
    traceName?: string;
    /** When true, the caller will handle recording the trace. */
    deferRecord?: boolean;
  };
};

export type LLMResponse = {
  text: string;
  message: BaseMessage;
  toolCalls?: ToolCall[];
  raw?: unknown;
  usage?: { in?: number; out?: number; cacheRead?: number; cacheWrite?: number; cached?: boolean };
  trace?: { model?: string; latencyMs?: number; startedAt?: string; toolLatencyMs?: number };
};

export interface LLMCaller {
  call(input: LLMCallConfig): Promise<LLMResponse>;
}

export type ConversationThread = {
  turns: BaseMessage[];
  recent: (n?: number) => BaseMessage[];
};

export type HarnessConfig = {
  intentModel: string;
  responseModel: string;
  memoryModel?: string;
  maxIntentIterations?: number;
  timeoutsMs?: Partial<{
    intent: number;
    memory: number;
    respond: number;
  }>;
};

export type HarnessContext = {
  conversation: ConversationThread;
  config: HarnessConfig;
  conversationId: string;
  requestId?: string;
  turnId?: string;
  recordKeeper?: import("@/lib/conversation/recordKeeper").RecordKeeper;
  haContextManager?: import("../intent/tools/ha-context").HomeAssistantContextManager;
  now: () => Date;
};

export type HarnessResult<T> = {
  output: T;
  done: boolean;
  trace?: HarnessTrace;
  error?: HarnessError;
};

export type HarnessTrace = {
  model?: string;
  latencyMs?: number;
  tokens?: { in?: number; out?: number; cacheRead?: number; cacheWrite?: number; cached?: boolean };
  steps?: Array<Record<string, unknown>>;
};

export type HarnessError = {
  message: string;
  cause?: unknown;
};

export type StreamEvent = {
  type: "tool_call" | "tool_response" | "llm_call_start" | "llm_call_chunk" | "llm_call_complete" | "context_update";
  toolCall?: ToolCall;
  toolResponse?: {
    toolCallId: string;
    toolName: string;
    content: string;
  };
  llmCallStart?: {
    model: string;
    context: BaseMessage[];
    stage: string;
  };
  llmCallChunk?: {
    content: string;
    stage: string;
  };
  llmCallComplete?: {
    model: string;
    response: string;
    stage: string;
    usage?: { in?: number; out?: number; cacheRead?: number; cacheWrite?: number; cached?: boolean };
  };
  contextUpdate?: {
    messages: BaseMessage[];
    stage: string;
  };
};

export interface Harness<TIn, TOut> {
  run(input: TIn, ctx: HarnessContext, onStreamEvent?: (event: StreamEvent) => void): Promise<HarnessResult<TOut>>;
}