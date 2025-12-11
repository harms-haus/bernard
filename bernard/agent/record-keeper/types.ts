import type { BaseMessage } from "@langchain/core/messages";

import type { MessageRecord } from "@/lib/conversation/recordKeeper";

export type NormalizedConversation = {
  conversationId: string;
  messages: BaseMessage[];
  records?: MessageRecord[];
};



