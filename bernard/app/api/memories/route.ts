import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { memorizeValue } from "@/lib/memory/service";
import { getMemoryStore } from "@/lib/memory/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/memories" });
  if ("error" in auth) return auth.error;
  const store = await getMemoryStore();
  const memories = await store.list();
  auth.reqLog.success(200, { action: "memories.list", adminId: auth.admin.user.id, total: memories.length });
  return Response.json({ memories });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/memories" });
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json()) as { label?: string; content?: string; conversationId?: string };
    if (!body.label || !body.content || !body.conversationId) {
      auth.reqLog.failure(400, "missing_fields", { action: "memories.create" });
      return new Response(JSON.stringify({ error: "`label`, `content`, and `conversationId` are required" }), {
        status: 400
      });
    }

    const result = await memorizeValue({
      label: body.label,
      content: body.content,
      conversationId: body.conversationId
    });

    auth.reqLog.success(200, {
      action: "memories.create",
      adminId: auth.admin.user.id,
      conversationId: body.conversationId
    });
    return Response.json({
      outcome: result.outcome,
      memory: result.memory,
      predecessorId: result.predecessorId
    });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "memories.create" });
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}


