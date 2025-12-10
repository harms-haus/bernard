import type { BaseMessage } from "@langchain/core/messages";

import { createOrchestrator } from "@/agent/orchestrator/factory";
import { buildHarnessConfig } from "@/agent/orchestrator/config";
import { getPrimaryModel } from "@/lib/models";
import type { RecordKeeper } from "@/lib/recordKeeper";
export {
  mapOpenAIToMessages,
  mapRecordsToMessages,
  mapOpenAIToMessages as mapOpenAIToMessagesFn,
  mapRecordsToMessages as mapRecordsToMessagesFn,
  extractTokenUsage
} from "@/lib/messages";
export type { OpenAIMessage } from "@/lib/messages";
export { messageRecordToOpenAI } from "@/lib/messages";

export { createOrchestrator, buildHarnessConfig };
export type { Orchestrator } from "@/agent/orchestrator/orchestrator";
export type { HarnessConfig } from "@/agent/harness/lib/types";

type LegacyGraphContext = {
  recordKeeper: RecordKeeper;
  conversationId: string;
  requestId: string;
  token: string;
  model?: string;
  responseModel?: string;
  intentModel?: string;
};

function newInboundMessages(messages: BaseMessage[]): BaseMessage[] {
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const type = (messages[i] as { _getType?: () => string })._getType?.();
    if (type === "ai") {
      lastAssistantIndex = i;
      break;
    }
  }
  return messages.slice(lastAssistantIndex + 1);
}

export function buildGraph(ctx: LegacyGraphContext, _deps: Record<string, unknown> = {}) {
  const responseModel = ctx.responseModel ?? ctx.model ?? getPrimaryModel("response");
  const intentModel = ctx.intentModel ?? getPrimaryModel("intent", { fallback: [responseModel] });
  const { orchestrator } = createOrchestrator(ctx.recordKeeper, { intentModel, responseModel });
  const invoke = async (input: { messages: BaseMessage[] }) => {
    const persistable = newInboundMessages(input.messages);
    const result = await orchestrator.run({
      conversationId: ctx.conversationId,
      incoming: input.messages,
      persistable,
      intentInput: {},
      memoryInput: {}
    });
    const messages = [...input.messages, result.response.message];
    return { messages };
  };

  return {
    invoke,
    async *stream(input: { messages: BaseMessage[] }) {
      const res = await invoke(input);
      yield { messages: res.messages };
    }
  };
}


