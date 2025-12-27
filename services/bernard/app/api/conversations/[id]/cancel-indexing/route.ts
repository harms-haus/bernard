import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRequest(req, { route: "/api/conversations/[id]/cancel-indexing" });
  if ("error" in auth) return auth.error;

  const resolvedParams = await params;
  const conversationId = resolvedParams.id;
  const redis = getRedis();
  const keeper = new RecordKeeper(redis);

  try {
    const conversation = await keeper.getConversation(conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }

    const currentStatus = conversation.indexingStatus ?? "none";
    if (currentStatus === "indexed" || currentStatus === "failed") {
      return new Response(JSON.stringify({ 
        error: "Cannot cancel indexing in current state",
        currentStatus 
      }), { status: 409 });
    }

    const success = await keeper.cancelIndexing(conversationId);
    if (!success) {
      return new Response(JSON.stringify({ error: "Failed to cancel indexing tasks" }), { status: 500 });
    }

    const updatedConversation = await keeper.getConversation(conversationId);
    const newStatus = updatedConversation?.indexingStatus ?? "none";

    auth.reqLog.success(200, {
      action: "conversation.indexing.cancel",
      adminId: auth.admin.user.id,
      conversationId,
      oldStatus: currentStatus,
      newStatus
    });

    return Response.json({ 
      success: true,
      indexingStatus: newStatus,
      message: "Indexing tasks canceled successfully"
    });
  } catch (err) {
    auth.reqLog.failure(500, err, { action: "conversation.indexing.cancel" });
    return new Response(JSON.stringify({ error: "Unable to cancel indexing" }), { status: 500 });
  }
}