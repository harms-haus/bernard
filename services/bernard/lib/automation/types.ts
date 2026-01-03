// Event Types
export const AUTOMATION_EVENTS = {
  user_message: "user_message",
  assistant_message_complete: "assistant_message_complete",
} as const;

export type AutomationEventName = (typeof AUTOMATION_EVENTS)[keyof typeof AUTOMATION_EVENTS];

// Event Data Types
export type UserMessageEvent = {
  conversationId: string;
  userId: string;
  messageContent: string;
};

export type AssistantMessageCompleteEvent = {
  conversationId: string;
  userId: string;
  messageContent: string;
  userMessageContent: string;
};

// Union type for all event data
export type AutomationEventData =
  | UserMessageEvent
  | AssistantMessageCompleteEvent;

// Automation Event wrapper
export type AutomationEvent = {
  name: AutomationEventName;
  data: AutomationEventData;
  timestamp: number;
};

// Automation Interface
export interface Automation {
  id: string;
  name: string;
  description: string;
  hooks: AutomationEventName[];
  enabled: boolean;
  execute(event: AutomationEvent, context: AutomationContext): Promise<AutomationResult>;
}

// Automation execution context
export interface AutomationContext {
  logger?: (message: string, meta?: Record<string, unknown>) => void;
  settings: AutomationSettings;
  // Add other shared services as needed
}

// Automation execution result
export interface AutomationResult {
  ok: boolean;
  reason?: string;
  meta?: Record<string, unknown>;
}

// Automation settings (stored in settings file)
export interface AutomationSettings {
  enabled: boolean;
  lastRunTime?: number;
  lastRunDuration?: number;
  runCount: number;
}

// Automation registry entry
export interface AutomationRegistryEntry {
  automation: Automation;
  settings: AutomationSettings;
}

// Queue job payload
export interface AutomationJobPayload {
  automationId: string;
  event: AutomationEvent;
}

// Helper functions for type guards
export function isUserMessageEvent(data: AutomationEventData): data is UserMessageEvent {
  return 'messageContent' in data && !('conversationContent' in data);
}

export function isAssistantMessageCompleteEvent(data: AutomationEventData): data is AssistantMessageCompleteEvent {
  return 'messageContent' in data && 'userMessageContent' in data;
}
