
import type { MessageStructure, MessageType } from "@langchain/core/messages";
import { type BaseMessage, createMiddleware } from "langchain";

export const createMistralMiddleware = () => {
  let originalMessages: BaseMessage[] = [];
  return createMiddleware({
    name: "MistralMiddleware",
    beforeModel: (state) => {
      originalMessages = state.messages;
      return {
        messages: mapMessages(state.messages)
      }
    },
    afterModel: (_state) => {
      return {
        messages: originalMessages
      }
    },
  });
};

function mapMessages(_messages: BaseMessage<MessageStructure, MessageType>[]): BaseMessage<MessageStructure, MessageType>[] {
  throw new Error("Function not implemented.");
}
