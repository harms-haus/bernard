import { StructuredTool } from "@langchain/core/tools";

export type ToolFactoryResult = {
  ok: true;
  tool: StructuredTool;
} | {
  ok: false;
  name: string;
  reason: string;
};

export type ToolFactory = () => Promise<ToolFactoryResult>;

export interface DisabledTool {
  name: string;
  reason?: string | undefined;
}