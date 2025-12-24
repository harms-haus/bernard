import { RecordKeeper } from "../recordKeeper/conversation.keeper";
import { getRedis } from "../../lib/infra/redis";
import type { Automation, AutomationEvent, AutomationContext, AutomationResult, SummaryFlags } from "../../lib/automation/types";
import { isUserMessageEvent, isAssistantMessageCompleteEvent } from "../../lib/automation/types";

// Flag detection function (moved from conversationTasks.ts)
function detectFlags(text: string): SummaryFlags {
  const lowerText = text.toLowerCase();
  const has = (words: string[]) => words.some((word) => lowerText.includes(word));

  return {
    explicit: has(["nsfw", "porn", "sex", "nude", "explicit"]),
    forbidden: has(["bomb", "weapon", "attack", "terror", "kill", "drugs", "hack"])
  };
}

const automation: Automation = {
  id: 'flag-conversation',
  name: 'Flag Conversation',
  description: 'Detect and flag inappropriate content in user and assistant messages',
  hooks: ['user_message', 'assistant_message_complete'],
  enabled: true,

  async execute(event: AutomationEvent, context: AutomationContext): Promise<AutomationResult> {
    if (!isUserMessageEvent(event.data) && !isAssistantMessageCompleteEvent(event.data)) {
      return { ok: false, reason: "invalid_event_data" };
    }

    const { conversationId } = event.data;

    try {
      context.logger?.("Starting message flagging", {
        conversationId,
        eventType: event.name
      });

      // Get dependencies
      const redis = getRedis();
      const recordKeeper = new RecordKeeper(redis);

      // Get current conversation to check existing flags
      const conversation = await recordKeeper.getConversation(conversationId);
      if (!conversation) {
        context.logger?.("Conversation not found", { conversationId });
        return { ok: false, reason: "conversation_not_found" };
      }

      // Get all messages for the conversation to analyze
      const messages = await recordKeeper.getMessages(conversationId);
      if (!messages || messages.length === 0) {
        context.logger?.("No messages found for conversation", { conversationId });
        return { ok: false, reason: "no_messages" };
      }

      // Extract text content from all messages
      const textContent = messages
        .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
        .join(" ");

      // Detect flags
      const flags = detectFlags(textContent);

      context.logger?.("Flags detected", {
        conversationId,
        explicit: flags.explicit,
        forbidden: flags.forbidden
      });

      // Update conversation flags
      await recordKeeper.updateConversationFlags(conversationId, flags);

      context.logger?.("Conversation flags updated", {
        conversationId,
        ...flags
      });

      return {
        ok: true,
        meta: { ...flags }
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger?.("Message flagging failed", {
        conversationId,
        eventType: event.name,
        error: errorMessage
      });

      return {
        ok: false,
        reason: "flagging_failed",
        meta: { error: errorMessage }
      };
    }
  }
};

export { automation };
