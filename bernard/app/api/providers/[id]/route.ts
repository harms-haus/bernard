import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminRequest(req, { route: `/api/providers/${params.id}` });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const providers = await store.getProviders();
  const provider = providers.find(p => p.id === params.id);

  if (!provider) {
    return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404 });
  }

  auth.reqLog.success(200, { action: "providers.read", adminId: auth.admin.user.id, providerId: params.id });
  return Response.json(provider);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminRequest(req, { route: `/api/providers/${params.id}` });
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const store = settingsStore();

    // Validate required fields
    if (!body.name || !body.baseUrl || !body.apiKey) {
      return new Response(JSON.stringify({ error: "Missing required fields: name, baseUrl, apiKey" }), { status: 400 });
    }

    // Test the provider connection
    const testResult = await store.testProviderConnection({
      ...body,
      id: "",
      createdAt: "",
      updatedAt: ""
    });

    const updatedProvider = await store.updateProvider(params.id, {
      ...body,
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
      providerId: params.id,
      testStatus: testResult.status
    });

    return Response.json(updatedProvider);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "providers.update", providerId: params.id });
    return new Response(JSON.stringify({ error: "Invalid provider payload", reason }), { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminRequest(req, { route: `/api/providers/${params.id}` });
  if ("error" in auth) return auth.error;

  try {
    const store = settingsStore();
    const deleted = await store.deleteProvider(params.id);

    if (!deleted) {
      return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404 });
    }

    auth.reqLog.success(200, {
      action: "providers.delete",
      adminId: auth.admin.user.id,
      providerId: params.id
    });

    return Response.json({ success: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "providers.delete", providerId: params.id });
    return new Response(JSON.stringify({ error: "Failed to delete provider", reason }), { status: 400 });
  }
}