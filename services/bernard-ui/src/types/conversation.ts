// Conversation list item (shared between user and admin views)
export interface ConversationListItem {
  id: string;
  name?: string; // Display name (optional)
  description?: string; // Description (optional)
  userId: string;
  userName?: string; // Only for admin view
  createdAt: string;
  lastTouchedAt: string;
  archived: boolean;
  messageCount: number;
  llmCallCount?: number; // Number of LLM calls in conversation
  toolCallCount: number;
}

// Conversation metadata for detail view
export interface ConversationMetadata {
  id: string;
  name?: string;
  description?: string;
  userId: string;
  createdAt: string;
  lastTouchedAt: string;
  archived: boolean;
  archivedAt?: string;
  messageCount: number;
  userAssistantCount: number;
  toolCallCount: number;
  errorCount?: number;
}

// Conversation event for detail view
export interface ConversationEvent {
  id: string;
  type: 'user_message' | 'llm_call' | 'llm_response' | 'tool_call' | 'tool_response' | 'assistant_message';
  timestamp: string;
  data: Record<string, unknown>;
}

// Response type for list conversations endpoint
export interface ConversationsListResponse {
  conversations: ConversationListItem[];
  total: number;
  hasMore: boolean;
}

// Response type for get conversation endpoint
export interface ConversationDetailResponse {
  conversation: ConversationMetadata;
  events: ConversationEvent[];
}
