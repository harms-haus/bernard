import { getPrimaryModel } from "@/lib/models";
import type { HarnessConfig } from "../harness/lib/types";

export type OrchestratorConfigInput = {
  intentModel?: string;
  responseModel?: string;
  memoryModel?: string;
  maxIntentIterations?: number;
  timeoutsMs?: HarnessConfig["timeoutsMs"];
  responseCallerOptions?: { maxTokens?: number };
};

export async function buildHarnessConfig(overrides: OrchestratorConfigInput = {}): Promise<HarnessConfig> {
  const responseModel = overrides.responseModel ?? (await getPrimaryModel("response"));
  const intentModel = overrides.intentModel ?? (await getPrimaryModel("intent", { fallback: [responseModel] }));
  const memoryModel = overrides.memoryModel ?? (await getPrimaryModel("memory", { fallback: [responseModel] }));

  return {
    intentModel,
    responseModel,
    memoryModel,
    maxIntentIterations: overrides.maxIntentIterations ?? 4,
    timeoutsMs: overrides.timeoutsMs
  };
}


