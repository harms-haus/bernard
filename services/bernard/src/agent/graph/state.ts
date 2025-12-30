import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Maximum number of router→tools→router loop iterations to prevent infinite loops
 */
export const MAX_ROUTER_ITERATIONS = 10;

/**
 * Bernard LangGraph State Definition
 *
 * This state is shared across both voice and text chat graphs.
 * It tracks messages, memories, tool results, status updates, and loop iteration count.
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
  iterationCount: Annotation<number>({
    reducer: () => 0,
    default: () => 0,
  }),
});

// Extract the state type for function signatures
export type BernardStateType = typeof BernardState.State;
