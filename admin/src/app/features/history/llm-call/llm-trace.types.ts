import { ConversationMessage } from '../../../data/models';

export type ToolCall = NonNullable<ConversationMessage['tool_calls']>[number];

export type TraceEntry = {
  id: string;
  role: ConversationMessage['role'];
  name?: string;
  content: unknown;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  raw: unknown;
};

export type LlmTrace = {
  type: 'llm_call';
  model?: string;
  at?: string;
  latencyMs?: number;
  tokens?: Record<string, unknown>;
  context: TraceEntry[];
  result: TraceEntry[];
  raw: unknown;
};

