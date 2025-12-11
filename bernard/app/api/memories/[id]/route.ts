import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { getMemoryStore } from "@/lib/memory/store";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/memories/[id]" });
  if ("error" in auth) return auth.error;
  const store = await getMemoryStore();
  const { id } = await params;
  const memory = await store.getMemory(id);
  if (!memory) {
    auth.reqLog.failure(404, "memory_not_found", { action: "memories.read", memoryId: id });
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  auth.reqLog.success(200, { action: "memories.read", adminId: auth.admin.user.id, memoryId: id });
  return Response.json({ memory });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/memories/[id]" });
  if ("error" in auth) return auth.error;

  const store = await getMemoryStore();
  const { id } = await params;
  try {
    const body = (await req.json()) as {
      label?: string;
      content?: string;
      conversationId?: string;
      successorId?: string | null;
      refresh?: boolean;
    };

    if (body.refresh) {
      const refreshed = await store.refreshMemory(id);
      if (!refreshed) {
        auth.reqLog.failure(404, "memory_not_found", { action: "memories.refresh", memoryId: id });
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      }
      auth.reqLog.success(200, { action: "memories.refresh", adminId: auth.admin.user.id, memoryId: id });
      return Response.json({ memory: refreshed });
    }

    if (!body.label && !body.content && !body.conversationId && body.successorId === undefined) {
      return new Response(JSON.stringify({ error: "No updates provided" }), { status: 400 });
    }

    const updated = await store.updateMemory(id, {
      ...(body.label ? { label: body.label } : {}),
      ...(body.content ? { content: body.content } : {}),
      ...(body.conversationId ? { conversationId: body.conversationId } : {}),
      ...(body.successorId !== undefined ? { successorId: body.successorId ?? undefined } : {})
    });

    if (!updated) {
      auth.reqLog.failure(404, "memory_not_found", { action: "memories.update", memoryId: id });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    auth.reqLog.success(200, { action: "memories.update", adminId: auth.admin.user.id, memoryId: id });
    return Response.json({ memory: updated });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "memories.update", memoryId: id });
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/memories/[id]" });
  if ("error" in auth) return auth.error;
  const store = await getMemoryStore();
  const { id } = await params;
  await store.deleteMemory(id);
  auth.reqLog.success(200, { action: "memories.delete", adminId: auth.admin.user.id, memoryId: id });
  return Response.json({ removed: true });
}


