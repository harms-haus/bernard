import { Writable } from "node:stream";

import pino, { stdTimeFunctions, type DestinationStream } from "pino";
import { describe, expect, it } from "vitest";

import {
  childLogger,
  ensureRequestId,
  redactionPaths,
  startTimer,
  toErrorObject
} from "@/lib/logging";

describe("logging utilities", () => {
  it("applies child bindings", () => {
    const base = pino({ base: {}, timestamp: stdTimeFunctions.mockTime });
    const log = childLogger({ requestId: "req-1", conversationId: "conv-1" }, base);
    expect(log.bindings()).toMatchObject({ requestId: "req-1", conversationId: "conv-1" });
  });

  it("redacts sensitive keys", () => {
    const output: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        output.push(chunk.toString());
        cb();
      }
    });
    const testLogger = pino(
      { base: {}, redact: { paths: redactionPaths, censor: "[redacted]" }, timestamp: stdTimeFunctions.mockTime },
      stream as unknown as DestinationStream
    );
    testLogger.info({ apiKey: "secret-api", nested: { token: "abc123" } }, "sensitive");
    const logged = output.join("\n");
    expect(logged).toContain("[redacted]");
    expect(logged).not.toContain("secret-api");
    expect(logged).not.toContain("abc123");
  });

  it("builds request ids and timers", async () => {
    const id = ensureRequestId();
    expect(id).toMatch(/^[-0-9a-f]+$/i);
    const timer = startTimer();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(timer()).toBeGreaterThanOrEqual(1);
  });

  it("normalizes errors", () => {
    const err = toErrorObject(new Error("boom"));
    expect(err.message).toBe("boom");
    const plain = toErrorObject("oops");
    expect(plain.message).toBe("oops");
  });
});
