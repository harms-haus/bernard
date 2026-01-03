import type { IncomingMessage } from "node:http";

import { BERNARD_MODEL_ID, isBernardModel } from "../openai";

type UsageLike = {
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
};

type JsonParseOk<T> = { ok: T };
type JsonParseError = { error: { status: number; message: string; detail?: string } };
export type JsonParseResult<T> = JsonParseOk<T> | JsonParseError;

/**
 * Safely parse a JSON request body and return a typed result or an error response.
 */
export async function parseJsonBody<T>(req: IncomingMessage): Promise<JsonParseResult<T>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body) as T;
        resolve({ ok: parsed });
      } catch (err) {
        resolve({
          error: { status: 400, message: "Invalid JSON", detail: err instanceof Error ? err.message : String(err) }
        });
      }
    });
    req.on("error", (err: Error) => {
      resolve({
        error: { status: 400, message: "Request read error", detail: err.message }
      });
    });
  });
}

/**
 * Ensure the requested model is Bernard's public model.
 */
export function ensureBernardModel(model?: string | null): { status: number; message: string; allowed: string } | null {
  if (isBernardModel(model)) return null;
  return { status: 404, message: "Model not found", allowed: BERNARD_MODEL_ID };
}

/**
 * Reject any unsupported OpenAI-compatible parameters present in a request body.
 */
export function rejectUnsupportedKeys<T extends Record<string, unknown>>(
  body: T,
  unsupported: Array<keyof T>
): { status: number; message: string; parameter: string } | null {
  for (const key of unsupported) {
    const value = body[key];
    if (value !== undefined && value !== null) {
      return { status: 400, message: `Unsupported parameter: ${String(key)}`, parameter: String(key) };
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
export function finalizeTurn(opts: {
  turnId: string;
  requestId: string;
  start: number;
  status: "ok" | "error";
  errorType?: string;
}): number {
  const latencyMs = Date.now() - opts.start;
  // No-op: conversation keeping has been removed
  return latencyMs;
}


