import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminRequest(req, { route: "/api/conversations/[id]/indexing-status" });
  if ("error" in auth) return auth.error;

  const conversationId = params.id;
  const redis = getRedis();
  const keeper = new RecordKeeper(redis);

  try {
    const conversation = await keeper.getConversation(conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }

    const status = conversation.indexingStatus ?? "none";
    const error = conversation.indexingError;
    const attempts = conversation.indexingAttempts;

    auth.reqLog.success(200, {
      action: "conversation.indexing_status.get",
      adminId: auth.admin.user.id,
      conversationId,
      status
    });

    return Response.json({ 
      indexingStatus: status, 
      indexingError: error, 
      indexingAttempts: attempts 
    });
  } catch (err) {
    auth.reqLog.failure(500, err, { action: "conversation.indexing_status.get" });
    return new Response(JSON.stringify({ error: "Unable to get indexing status" }), { status: 500 });
  }
}