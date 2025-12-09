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
    recordKeeper?: import("@/lib/recordKeeper").RecordKeeper;
    traceName?: string;
  };
};

export type LLMResponse = {
  text: string;
  message: BaseMessage;
  toolCalls?: ToolCall[];
  raw?: unknown;
  usage?: { in?: number; out?: number; cacheRead?: number; cacheWrite?: number; cached?: boolean };
  trace?: { model?: string; latencyMs?: number };
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
  recordKeeper?: import("@/lib/recordKeeper").RecordKeeper;
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

export interface Harness<TIn, TOut> {
  run(input: TIn, ctx: HarnessContext): Promise<HarnessResult<TOut>>;
}


