import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * Maximum number of router→tools→router loop iterations to prevent infinite loops
 */
export const MAX_REACT_ITERATIONS = 10;

/**
 * Bernard LangGraph State Definition
 *
 * This state tracks messages, memories, tool results, status updates, and loop iteration count.
 */
export const BernardState = Annotation.Root({
  ...MessagesAnnotation.spec,
  memories: Annotation<string[]>({
    reducer: (x, y) => [...new Set([...x, ...y])],
    default: () => [],
  }),
  iterationCount: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
});

// Extract the state type for function signatures
export type BernardStateType = typeof BernardState.State;
