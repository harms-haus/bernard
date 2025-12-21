import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";
import { ModelsSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/models" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const models = await store.getModels();
  auth.reqLog.success(200, { action: "settings.models.read", adminId: auth.admin.user.id });
  return Response.json(models);
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/models" });
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = ModelsSettingsSchema.parse(body);

    // Check if embedding dimension has changed
    const currentSettings = await settingsStore().getModels();
    const embeddingDimensionChanged =
      currentSettings.embedding?.dimension !== parsed.embedding?.dimension &&
      parsed.embedding?.dimension !== undefined;

    // Save the new settings
    const saved = await settingsStore().setModels(parsed);

    // If embedding dimension changed, clear index and requeue conversations
    if (embeddingDimensionChanged) {
      auth.reqLog.log.info({
        event: "settings.models.embedding_dimension_changed",
        oldDimension: currentSettings.embedding?.dimension,
        newDimension: parsed.embedding?.dimension
      });

      try {
        // Call the clear embedding index endpoint
        const clearResponse = await fetch(`${req.nextUrl.origin}/api/admin/clear-embedding-index`, {
          method: 'POST',
          headers: {
            'Authorization': req.headers.get('authorization') || '',
            'Content-Type': 'application/json'
          }
        });

        if (!clearResponse.ok) {
          const errorText = await clearResponse.text();
          auth.reqLog.log.warn({
            event: "settings.models.clear_index_failed",
            status: clearResponse.status,
            error: errorText
          });
        } else {
          const result = await clearResponse.json();
          auth.reqLog.log.info({ event: "settings.models.clear_index_success", ...result });
        }
      } catch (clearErr) {
        const errorMessage = clearErr instanceof Error ? clearErr.message : String(clearErr);
        auth.reqLog.log.error({ event: "settings.models.clear_index_exception", error: errorMessage });
        // Don't fail the entire request, just log the error
      }
    }

    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "settings.models.update" });
    return new Response(JSON.stringify({ error: "Invalid models payload", reason }), { status: 400 });
  }
}

