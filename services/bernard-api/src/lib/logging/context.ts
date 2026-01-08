import type { Logger } from "pino";

import { childLogger, ensureRequestId, startTimer, type LogContext } from "./logger";

export type CorrelationIds = LogContext;

export function withLogContext(base: Logger, context: CorrelationIds): Logger {
  return childLogger(context, base);
}

export function withRequestContext(
  base: Logger,
  context: CorrelationIds = {},
  existingRequestId?: string | null
): { logger: Logger; requestId: string } {
  const requestId = ensureRequestId(existingRequestId ?? context.requestId);
  return { logger: childLogger({ ...context, requestId }, base), requestId };
}

export function elapsedTimer() {
  const elapsed = startTimer();
  return () => ({ durationMs: elapsed() });
}
