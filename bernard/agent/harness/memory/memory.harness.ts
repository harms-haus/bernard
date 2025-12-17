import type { Harness, HarnessContext, HarnessResult, StreamEvent } from "../lib/types";

export type MemoryInput = { query?: string };
export type MemoryOutput = { memories: Array<Record<string, unknown>> };

export class MemoryHarness implements Harness<MemoryInput, MemoryOutput> {
  async run(_input: MemoryInput, _ctx: HarnessContext, _onStreamEvent?: (event: StreamEvent) => void): Promise<HarnessResult<MemoryOutput>> {
    return { output: { memories: [] }, done: true };
  }
}



