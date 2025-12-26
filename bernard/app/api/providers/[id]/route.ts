import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";

export const runtime = "nodejs";

interface ProviderPayload {
  name: string;
  baseUrl: string;
  apiKey: string;
  type?: "openai" | "ollama" | undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const auth = await requireAdminRequest(req, { route: `/api/providers/${resolvedParams.id}` });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const providers = await store.getProviders();
  const provider = providers.find(p => p.id === resolvedParams.id);

  if (!provider) {
    return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404 });
  }

  auth.reqLog.success(200, { action: "providers.read", adminId: auth.admin.user.id, providerId: resolvedParams.id });
  return Response.json(provider);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const auth = await requireAdminRequest(req, { route: `/api/providers/${resolvedParams.id}` });
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json()) as Partial<ProviderPayload>;
    const store = settingsStore();

    // Validate required fields
    const { name, baseUrl, apiKey, type } = body;
    if (!name || !baseUrl || !apiKey) {
      return new Response(JSON.stringify({ error: "Missing required fields: name, baseUrl, apiKey" }), { status: 400 });
    }

    const payload: ProviderPayload = { name, baseUrl, apiKey, type };

    // Test the provider connection
    const testResult = await store.testProviderConnection({
      ...payload,
      id: "",
      createdAt: "",
      updatedAt: "",
      type: payload.type || "openai"
    });

    const updatedProvider = await store.updateProvider(resolvedParams.id, {
      name: payload.name,
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      type: payload.type || "openai",
      lastTestedAt: new Date().toISOString(),
      testStatus: testResult.status,
      testError: testResult.error
    });

    if (!updatedProvider) {
      return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404 });
    }

    auth.reqLog.success(200, {
      action: "providers.update",
      adminId: auth.admin.user.id,
      providerId: resolvedParams.id,
      testStatus: testResult.status
    });

    return Response.json(updatedProvider);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "providers.update", providerId: resolvedParams.id });
    return new Response(JSON.stringify({ error: "Invalid provider payload", reason }), { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const auth = await requireAdminRequest(req, { route: `/api/providers/${resolvedParams.id}` });
  if ("error" in auth) return auth.error;

  try {
    const store = settingsStore();
    const deleted = await store.deleteProvider(resolvedParams.id);

    if (!deleted) {
      return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404 });
    }

    auth.reqLog.success(200, {
      action: "providers.delete",
      adminId: auth.admin.user.id,
      providerId: resolvedParams.id
    });

    return Response.json({ success: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "providers.delete", providerId: resolvedParams.id });
    return new Response(JSON.stringify({ error: "Failed to delete provider", reason }), { status: 400 });
  }
}