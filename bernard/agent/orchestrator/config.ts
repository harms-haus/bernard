import { getPrimaryModel } from "@/lib/models";
import type { HarnessConfig } from "../harness/lib/types";

export type OrchestratorConfigInput = {
  intentModel?: string;
  responseModel?: string;
  memoryModel?: string;
  maxIntentIterations?: number;
  timeoutsMs?: HarnessConfig["timeoutsMs"];
};

export function buildHarnessConfig(overrides: OrchestratorConfigInput = {}): HarnessConfig {
  const responseModel = overrides.responseModel ?? getPrimaryModel("response");
  const intentModel = overrides.intentModel ?? getPrimaryModel("intent", { fallback: [responseModel] });
  const memoryModel = overrides.memoryModel ?? getPrimaryModel("utility", { fallback: [responseModel] });

  return {
    intentModel,
    responseModel,
    memoryModel,
    maxIntentIterations: overrides.maxIntentIterations ?? 4,
    timeoutsMs: overrides.timeoutsMs
  };
}


