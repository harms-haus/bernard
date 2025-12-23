import { NextRequest } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/admin";
import { getAutomationRegistry } from "@/lib/automation/registry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/automations" });
  if ("error" in auth) return auth.error;

  try {
    const registry = await getAutomationRegistry();
    const automations = Array.from(registry.entries()).map(([id, entry]) => ({
      id,
      name: entry.automation.name,
      description: entry.automation.description,
      hooks: entry.automation.hooks,
      enabled: entry.settings.enabled,
      lastRunTime: entry.settings.lastRunTime,
      lastRunDuration: entry.settings.lastRunDuration,
      runCount: entry.settings.runCount
    }));

    auth.reqLog.success(200, { automationCount: automations.length });
    return Response.json({ automations });
  } catch (err) {
    auth.reqLog.failure(500, err, {});
    return new Response(JSON.stringify({ error: "Failed to fetch automations" }), { status: 500 });
  }
}
