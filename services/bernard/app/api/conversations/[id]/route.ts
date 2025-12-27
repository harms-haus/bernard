import type { NextRequest } from "next/server";
import { getRedis } from "@/lib/infra/redis";
import { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import { validateAuth } from "@/app/api/v1/_lib/openai";
import { logger } from "@/lib/logging";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await validateAuth(req);
  if ("error" in auth) return auth.error;

  const { id: conversationId } = await params;

  try {
    const body = (await req.json()) as { ghost?: unknown };
    const { ghost } = body;

    if (typeof ghost !== "boolean") {
      return new Response(JSON.stringify({ error: "ghost must be a boolean" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const redis = getRedis();
    const keeper = new RecordKeeper(redis);

    // Get the conversation to check current state
    const conversation = await keeper.getConversation(conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Validation rules:
    // 1. Closed ghost conversations cannot be converted to non-ghost
    // 2. Open conversations can toggle ghost mode freely
    // 3. Reopened ghost conversations can remove ghost mode (but this is handled in startRequest)

    if (conversation.status === "closed" && conversation.ghost === true && ghost === false) {
      return new Response(JSON.stringify({ error: "Cannot convert closed ghost conversations to non-ghost" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (conversation.status !== "open") {
      return new Response(JSON.stringify({ error: "Can only update ghost status for open conversations" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Update the ghost status
    await redis.hset(keeper["key"](`conv:${conversationId}`), {
      ghost: ghost.toString()
    });

    return new Response(JSON.stringify({
      conversationId,
      ghost,
      updated: true
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    logger.error({ event: "conversation.ghost.update.error", conversationId, error: error instanceof Error ? error.message : String(error) }, "Error updating conversation ghost status");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
