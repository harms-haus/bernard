import type { Harness, HarnessContext, HarnessResult } from "../lib/types";

export type MemoryInput = { query?: string };
export type MemoryOutput = { memories: Array<Record<string, unknown>> };

export class MemoryHarness implements Harness<MemoryInput, MemoryOutput> {
  async run(_input: MemoryInput, _ctx: HarnessContext): Promise<HarnessResult<MemoryOutput>> {
    return { output: { memories: [] }, done: true };
  }
}



