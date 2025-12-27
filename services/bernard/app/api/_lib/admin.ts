import type { NextRequest } from "next/server";

import { requireAdmin, type AuthenticatedUser } from "@/lib/auth";
import type { LogContext } from "@/lib/logging";

import { buildRequestLogger } from "./logging";

export type AdminRequestContext = {
  admin: AuthenticatedUser;
  reqLog: ReturnType<typeof buildRequestLogger>;
};

export async function requireAdminRequest(
  req: NextRequest,
  context: LogContext = {}
): Promise<{ error: Response; reqLog: ReturnType<typeof buildRequestLogger> } | AdminRequestContext> {
  const reqLog = buildRequestLogger(req, context);
  const admin = await requireAdmin(req);
  if (!admin) {
    const error = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    reqLog.failure(401, "admin_required");
    return { error, reqLog };
  }
  reqLog.log.info({ event: "admin.auth.granted", adminId: admin.user.id });
  return { admin, reqLog };
}
