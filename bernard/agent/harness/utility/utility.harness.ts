import type { Harness, HarnessContext, HarnessResult } from "../lib/types";

export type UtilityInput = Record<string, unknown>;
export type UtilityOutput = Record<string, unknown>;

export class UtilityHarness implements Harness<UtilityInput, UtilityOutput> {
  async run(_input: UtilityInput, _ctx: HarnessContext): Promise<HarnessResult<UtilityOutput>> {
    return { output: {}, done: true };
  }
}


