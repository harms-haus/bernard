import type { NextRequest } from "next/server";

import { childLogger, ensureRequestId, logger, startTimer, toErrorObject, type LogContext } from "@/lib/logging";

export function buildRequestLogger(req: NextRequest, context: LogContext = {}) {
  const url = new URL(req.url);
  const requestId = ensureRequestId(req.headers.get("x-request-id"));
  const log = childLogger({ ...context, route: url.pathname, requestId, component: "api" }, logger);
  const timer = startTimer();

  log.info({ event: "api.request.start", method: req.method, path: url.pathname });

  return {
    log,
    requestId,
    success(status: number, meta?: Record<string, unknown>) {
      log.info({ event: "api.request.success", status, durationMs: timer(), ...meta });
    },
    failure(status: number, err: unknown, meta?: Record<string, unknown>) {
      log.error({ event: "api.request.error", status, durationMs: timer(), err: toErrorObject(err), ...meta });
    }
  };
}
