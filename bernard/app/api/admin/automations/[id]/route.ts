import { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { updateAutomationSettings } from "@/lib/automation/registry";

type RouteParams = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/automations/[id]" });
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await req.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return new Response(JSON.stringify({ error: "enabled must be a boolean" }), { status: 400 });
    }

    // Update the automation settings
    const updatedSettings = await updateAutomationSettings(id, { enabled });

    auth.reqLog.success(200, { automationId: id, enabled });
    return Response.json({
      id,
      enabled: updatedSettings.enabled,
      lastRunTime: updatedSettings.lastRunTime,
      lastRunDuration: updatedSettings.lastRunDuration,
      runCount: updatedSettings.runCount
    });
  } catch (err) {
    auth.reqLog.failure(500, err, { automationId: id });
    return new Response(JSON.stringify({ error: "Failed to update automation" }), { status: 500 });
  }
}
