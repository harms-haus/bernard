import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * Bernard LangGraph State Definition
 * 
 * This state is shared across both voice and text chat graphs.
 * It tracks messages, memories, tool results, and status updates.
 */
export const BernardState = Annotation.Root({
  ...MessagesAnnotation.spec,
  memories: Annotation<string[]>({
    reducer: (x, y) => [...new Set([...x, ...y])],
    default: () => [],
  }),
  toolResults: Annotation<Record<string, string>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  status: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "pending",
  }),
});

// Extract the state type for function signatures
export type BernardStateType = typeof BernardState.State;
