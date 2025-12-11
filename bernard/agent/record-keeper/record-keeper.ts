import type { BaseMessage } from "@langchain/core/messages";

import { mapRecordsToMessages } from "@/lib/conversation/messages";
import { RecordKeeper as CoreRecordKeeper, type MessageRecord } from "@/lib/conversation/recordKeeper";
import type { ConversationThread } from "../harness/lib/types";
import type { NormalizedConversation } from "./types";

export function buildConversationThread(messages: BaseMessage[]): ConversationThread {
  const filtered = messages.filter((msg) => (msg as { _getType?: () => string })._getType?.() !== "system");
  return {
    turns: filtered,
    recent: (n?: number) => (typeof n === "number" && n > 0 ? filtered.slice(-n) : filtered)
  };
}

export class HarnessRecordKeeper {
  constructor(private readonly keeper: CoreRecordKeeper) {}

  snapshotFromRecords(conversationId: string, records: MessageRecord[]): NormalizedConversation {
    const messages = mapRecordsToMessages(records);
    return {
      conversationId,
      messages,
      records
    };
  }

  toThread(messages: BaseMessage[]): ConversationThread {
    return buildConversationThread(messages);
  }

  get core(): CoreRecordKeeper {
    return this.keeper;
  }
}


