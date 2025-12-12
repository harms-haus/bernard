import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(req, { route: "/api/conversations/[id]/retry-indexing" });
  if ("error" in auth) return auth.error;

  const conversationId = params.id;
  const redis = getRedis();
  const keeper = new RecordKeeper(redis);

  try {
    const conversation = await keeper.getConversation(conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }

    const currentStatus = conversation.indexingStatus ?? "none";
    if (currentStatus === "queued" || currentStatus === "indexing") {
      return new Response(JSON.stringify({ 
        error: "Cannot retry indexing while already queued or processing",
        currentStatus 
      }), { status: 409 });
    }

    const success = await keeper.retryIndexing(conversationId);
    if (!success) {
      return new Response(JSON.stringify({ error: "Failed to queue indexing tasks" }), { status: 500 });
    }

    const updatedConversation = await keeper.getConversation(conversationId);
    const newStatus = updatedConversation?.indexingStatus ?? "queued";

    auth.reqLog.success(200, {
      action: "conversation.indexing.retry",
      adminId: auth.admin.user.id,
      conversationId,
      oldStatus: currentStatus,
      newStatus
    });

    return Response.json({ 
      success: true,
      indexingStatus: newStatus,
      message: "Indexing tasks queued successfully"
    });
  } catch (err) {
    auth.reqLog.failure(500, err, { action: "conversation.indexing.retry" });
    return new Response(JSON.stringify({ error: "Unable to retry indexing" }), { status: 500 });
  }
}