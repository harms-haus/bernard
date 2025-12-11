import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { BERNARD_MODEL_ID, isBernardModel } from "@/app/api/v1/_lib/openai";

type UsageLike = {
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
};

type JsonParseOk<T> = { ok: T };
type JsonParseError = { error: NextResponse };
export type JsonParseResult<T> = JsonParseOk<T> | JsonParseError;

/**
 * Safely parse a JSON request body and return a typed result or an error response.
 */
export async function parseJsonBody<T>(req: NextRequest): Promise<JsonParseResult<T>> {
  try {
    const body = (await req.json()) as T;
    return { ok: body };
  } catch (err) {
    return {
      error: new NextResponse(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), { status: 400 })
    };
  }
}

/**
 * Ensure the requested model is Bernard's public model.
 */
export function ensureBernardModel(model?: string | null): NextResponse | null {
  if (isBernardModel(model)) return null;
  return new NextResponse(JSON.stringify({ error: "Model not found", allowed: BERNARD_MODEL_ID }), { status: 404 });
}

/**
 * Reject any unsupported OpenAI-compatible parameters present in a request body.
 */
export function rejectUnsupportedKeys<T extends Record<string, unknown>>(
  body: T,
  unsupported: Array<keyof T>
): NextResponse | null {
  for (const key of unsupported) {
    const value = body[key];
    if (value !== undefined && value !== null) {
      return new NextResponse(JSON.stringify({ error: `Unsupported parameter: ${String(key)}` }), { status: 400 });
    }
  }
  return null;
}

/**
 * Normalize stop parameters into a string array.
 */
export function normalizeStop(stop?: string | string[] | null): string[] | undefined {
  if (Array.isArray(stop)) return stop;
  if (typeof stop === "string") return [stop];
  return undefined;
}

/**
 * Build a classic OpenAI usage shape from token metadata.
 */
export function buildUsage(meta: UsageLike) {
  const promptTokens = meta.prompt_tokens ?? meta.input_tokens;
  const completionTokens = meta.completion_tokens ?? meta.output_tokens;
  if (typeof promptTokens !== "number" && typeof completionTokens !== "number") return undefined;
  return {
    prompt_tokens: promptTokens ?? 0,
    completion_tokens: completionTokens ?? 0,
    total_tokens: (promptTokens ?? 0) + (completionTokens ?? 0)
  };
}

/**
 * Finalize an agent request, recording latency and success/error metadata.
 */
export async function finalizeTurn(opts: {
  keeper: RecordKeeper;
  turnId: string;
  requestId: string;
  start: number;
  status: "ok" | "error";
  errorType?: string;
}): Promise<number> {
  const latencyMs = Date.now() - opts.start;
  await opts.keeper.endTurn(opts.turnId, {
    status: opts.status,
    latencyMs,
    ...(opts.errorType ? { errorType: opts.errorType } : {})
  });
  await opts.keeper.completeRequest(opts.requestId, latencyMs);
  return latencyMs;
}


