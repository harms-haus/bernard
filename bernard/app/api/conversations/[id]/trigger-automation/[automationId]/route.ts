import { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { getRedis } from "@/lib/infra/redis";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { enqueueAutomationJob } from "@/lib/automation/queue";
import type { AutomationEvent, ConversationArchivedEvent, UserMessageEvent, AssistantMessageCompleteEvent } from "@/lib/automation/types";

type RouteParams = { params: Promise<{ id: string; automationId: string }> };

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/conversations/[id]/trigger-automation/[automationId]" });
  if ("error" in auth) return auth.error;

  const { id: conversationId, automationId } = await params;

  try {
    const redis = getRedis();
    const recordKeeper = new RecordKeeper(redis);

    // Verify conversation exists
    const conversation = await recordKeeper.getConversation(conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get messages for the conversation (needed for most automations)
    const messages = await recordKeeper.getMessages(conversationId);
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages found for conversation" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    let event: AutomationEvent;

    // Create appropriate event based on automation type
    switch (automationId) {
      case 'summarize-conversation':
      case 'tag-conversation':
        // These automations expect a conversation_archived event
        event = {
          name: 'conversation_archived',
          data: {
            conversationId,
            userId: conversation.userId || 'admin', // Use admin as default user for manual triggers
            conversationContent: conversation
          } as ConversationArchivedEvent,
          timestamp: Date.now()
        };
        break;

      case 'flag-conversation':
        // Flag automation can work with either user_message or assistant_message_complete
        // We'll create an assistant_message_complete event with the last assistant message
        const lastAssistantMessage = messages
          .filter(m => m.role === 'assistant')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        if (!lastAssistantMessage) {
          return new Response(JSON.stringify({ error: "No assistant messages found to analyze for flags" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Find the corresponding user message
        const lastUserMessage = messages
          .filter(m => m.role === 'user')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        event = {
          name: 'assistant_message_complete',
          data: {
            conversationId,
            userId: conversation.userId || 'admin',
            messageContent: typeof lastAssistantMessage.content === 'string' ? lastAssistantMessage.content : JSON.stringify(lastAssistantMessage.content),
            userMessageContent: lastUserMessage ? (typeof lastUserMessage.content === 'string' ? lastUserMessage.content : JSON.stringify(lastUserMessage.content)) : ''
          } as AssistantMessageCompleteEvent,
          timestamp: Date.now()
        };
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown automation: ${automationId}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
    }

    // Enqueue the automation job
    await enqueueAutomationJob(automationId, event);

    auth.reqLog.success(200, { conversationId, automationId });
    return Response.json({
      success: true,
      message: `${automationId} automation queued for conversation ${conversationId}`,
      conversationId,
      automationId
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(500, err, { conversationId, automationId });
    return new Response(JSON.stringify({
      error: "Failed to trigger automation",
      details: errorMessage
    }), { status: 500 });
  }
}
