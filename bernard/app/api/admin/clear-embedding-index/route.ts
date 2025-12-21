import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { clearEmbeddingIndex } from "@/app/api/_lib/embeddingIndex";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/clear-embedding-index" });
  if ("error" in auth) return auth.error;

  try {
    const result = await clearEmbeddingIndex(auth);
    return Response.json(result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(500, err, { event: "admin.clear_embedding_index.failed", error: errorMessage });
    return new Response(JSON.stringify({
      error: "Failed to clear embedding index and requeue conversations",
      details: errorMessage
    }), { status: 500 });
  }
}
