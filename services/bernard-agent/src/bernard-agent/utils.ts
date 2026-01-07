import { LangGraphRunnableConfig } from "@langchain/langgraph";


export interface LlmOptions {
  temperature?: number | undefined;
  topP?: number | undefined;
  maxTokens?: number | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
}

export type ProgressReporter = {
  report: (message: string) => void;
  reset: () => void;
};

export function createProgressReporter(config: LangGraphRunnableConfig, toolName: string): ProgressReporter {
  return {
    report: (message: string) =>
      config['writer']?.({
        _type: "tool_progress",
        tool: toolName,
        phase: "step",
        message,
      }),
    reset: () =>
      config['writer']?.({
        _type: "tool_progress",
        tool: toolName,
        phase: "complete",
        message: "Done",
      })
  };
}
