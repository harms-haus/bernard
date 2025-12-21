import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/providers" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const providers = await store.getProviders();
  auth.reqLog.success(200, { action: "providers.list", adminId: auth.admin.user.id });
  return Response.json(providers);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/providers" });
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

    const provider = await store.addProvider({
      name: body.name,
      type: body.type || "openai",
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      lastTestedAt: new Date().toISOString(),
      testStatus: testResult.status,
      testError: testResult.error
    });

    auth.reqLog.success(201, {
      action: "providers.create",
      adminId: auth.admin.user.id,
      providerId: provider.id,
      testStatus: testResult.status
    });

    return Response.json(provider, { status: 201 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "providers.create" });
    return new Response(JSON.stringify({ error: "Invalid provider payload", reason }), { status: 400 });
  }
}