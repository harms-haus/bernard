import { LangGraphRunnableConfig } from "@langchain/langgraph";


export interface LlmOptions {
  temperature?: number | undefined;
  topP?: number | undefined;
  maxTokens?: number | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
}

export type ProgressReporter = (message: string) => void;

export function createProgressReporter(config: LangGraphRunnableConfig, toolName: string): ProgressReporter {
  return (message: string) => {
    config['writer']?.({
      _type: "tool_progress",
      tool: toolName,
      phase: "step",
      message,
    });
  };
}

