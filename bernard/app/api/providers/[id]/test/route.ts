import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminRequest(req, { route: `/api/providers/${params.id}/test` });
  if ("error" in auth) return auth.error;

  try {
    const store = settingsStore();
    const providers = await store.getProviders();
    const provider = providers.find(p => p.id === params.id);

    if (!provider) {
      return new Response(JSON.stringify({ error: "Provider not found" }), { status: 404 });
    }

    const testResult = await store.testProviderConnection(provider);

    // Update provider with test results
    await store.updateProvider(params.id, {
      lastTestedAt: new Date().toISOString(),
      testStatus: testResult.status,
      testError: testResult.error
    });

    auth.reqLog.success(200, {
      action: "providers.test",
      adminId: auth.admin.user.id,
      providerId: params.id,
      testStatus: testResult.status
    });

    return Response.json({
      status: testResult.status,
      error: testResult.error,
      modelCount: testResult.modelCount,
      testedAt: new Date().toISOString()
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "providers.test", providerId: params.id });
    return new Response(JSON.stringify({ error: "Failed to test provider", reason }), { status: 400 });
  }
}