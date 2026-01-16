/**
 * Message record type for chat messages
 * Originally from bernard/lib/conversation/types
 * Kept for backward compatibility with admin/user detail pages
 */
export interface MessageRecord {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Record<string, unknown> | Array<Record<string, unknown>> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
  createdAt: string;
  tokenDeltas?: { in?: number; out?: number };
  metadata?: Record<string, unknown>;
}

export interface TraceEvent {
  id: string;
  type: 'llm_call' | 'tool_call' | 'recollection';
  data: any;
  timestamp: Date;
  status: 'loading' | 'completed';
  result?: any;
  durationMs?: number;
}
