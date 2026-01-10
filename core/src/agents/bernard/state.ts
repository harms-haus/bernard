/**
 * Main graph state for Bernard agent.
 * 
 * SIMPLIFIED: No memory fields - memory system deferred to future implementation.
 * Uses standard MessagesAnnotation for message handling.
 */
import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { messagesStateReducer } from "@langchain/langgraph";

/**
 * Main state annotation for the Bernard agent graph.
 */
export const BernardStateAnnotation = Annotation.Root({
  /**
   * The messages in the conversation.
   * Uses the standard messages reducer for appending new messages.
   */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

export type BernardState = typeof BernardStateAnnotation.State;
