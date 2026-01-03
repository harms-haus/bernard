import type { Logger } from "pino";
import type { Tracer } from "./trace";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

/**
 * 
 * Context for agents
 */
export type AgentContext = {
  checkpointer: BaseCheckpointSaver;
  logger: Logger;
  tracer: Tracer;
  tools: (ServerTool | ClientTool)[];
  disabledTools?: Array<{ name: string; reason: string }>;
};
