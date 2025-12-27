import type { BernardStateType } from "../graph/state";
import type { BaseMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";

/**
 * Recollection Node - Gathers relevant memories using LangGraph Memory
 * 
 * This node uses LangGraph's Memory system to retrieve relevant memories
 * based on the current conversation context.
 */
export async function recollectionNode(
  state: BernardStateType,
  config: { configurable?: { thread_id?: string; user_id?: string } }
): Promise<Partial<BernardStateType>> {
  // For now, this is a placeholder that will be enhanced with LangGraph Memory
  // The memory system will be integrated via the graph's store parameter
  
  // Extract query from user messages
  const userMessages = state.messages.filter(
    (msg) => msg._getType() === "human"
  );
  
  if (userMessages.length === 0) {
    return { memories: [] };
  }

  // Get the last user message as query
  const lastMessage = userMessages[userMessages.length - 1];
  if (!lastMessage) {
    return { memories: [] };
  }
  const query = lastMessage.content as string;
  
  // TODO: Integrate with LangGraph Memory store for semantic search
  // For now, return empty memories - this will be enhanced when we add Memory store
  const memories: string[] = [];

  return { memories };
}
