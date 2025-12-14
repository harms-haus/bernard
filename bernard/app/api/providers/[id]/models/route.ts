import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";
import { ttlSeconds } from "@/lib/memory";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminRequest(req, { route: `/api/providers/${params.id}/models` });
  if ("error" in auth) return auth.error;

  try {
    const store = settingsStore();
    const providers = await store.getProviders();
    const provider = providers.find(p => p.id === params.id);

    if (!provider) {
      return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404 });
    }

    // Check if we have cached models and they're still fresh (5 minutes)
    const cacheKey = `provider:${provider.id}:models`;
    const redis = store["redis"];
    const cached = await redis.get(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          auth.reqLog.success(200, {
            action: "providers.models.get",
            adminId: auth.admin.user.id,
            providerId: params.id,
            source: "cache"
          });
          return Response.json(parsed.models);
        }
      } catch {
        // Cache invalid, continue to fetch fresh
      }
    }

    // Fetch fresh models from provider
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${provider.baseUrl}/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid models response format");
    }

    // Cache the models
    const models = data.data.map((model: any) => ({
      id: model.id,
      object: model.object || "model",
      created: model.created,
      owned_by: model.owned_by || "unknown"
    }));

    await redis.set(cacheKey, JSON.stringify({
      models,
      timestamp: Date.now()
    }), "EX", 360); // 6 minutes TTL

    auth.reqLog.success(200, {
      action: "providers.models.get",
      adminId: auth.admin.user.id,
      providerId: params.id,
      source: "provider",
      modelCount: models.length
    });

    return Response.json(models);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "providers.models.get", providerId: params.id, reason });
    return new Response(JSON.stringify({ error: "Failed to fetch models from provider" }), { status: 400 });
  }
}