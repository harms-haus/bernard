import type { BaseMessage } from "@langchain/core/messages";

import { createOrchestrator } from "@/agent/orchestrator/factory";
import { buildHarnessConfig } from "@/agent/orchestrator/config";
import type { OrchestratorRunInput } from "@/agent/orchestrator/orchestrator";
import { getPrimaryModel } from "@/lib/config/models";
import type { RecordKeeper } from "@/lib/conversation/recordKeeper";
import {
  mapOpenAIToMessages,
  mapRecordsToMessages,
  extractTokenUsage,
  messageRecordToOpenAI,
  type OpenAIMessage
} from "@/lib/conversation/messages";

export {
  mapOpenAIToMessages,
  mapRecordsToMessages,
  mapOpenAIToMessages as mapOpenAIToMessagesFn,
  mapRecordsToMessages as mapRecordsToMessagesFn,
  extractTokenUsage,
  messageRecordToOpenAI
};
export type { OpenAIMessage };

export { createOrchestrator, buildHarnessConfig };
export type { Orchestrator } from "@/agent/orchestrator/orchestrator";
export type { HarnessConfig } from "@/agent/harness/lib/types";

/* c8 ignore start */
type LegacyGraphContext = {
  recordKeeper: RecordKeeper;
  conversationId: string;
  requestId: string;
  token: string;
  model?: string;
  responseModel?: string;
  intentModel?: string;
  turnId?: string;
};

type BuildGraphDeps = {
  createOrchestratorFn?: typeof createOrchestrator;
  getPrimaryModelFn?: typeof getPrimaryModel;
  newInboundMessagesFn?: typeof newInboundMessages;
} & Record<string, unknown>;
/* c8 ignore end */

/**
 * Resolve dependency overrides to concrete implementations.
 */
export function resolveGraphDeps(deps: BuildGraphDeps) {
  return {
    createOrchestratorFn: deps.createOrchestratorFn ?? createOrchestrator,
    getPrimaryModelFn: deps.getPrimaryModelFn ?? getPrimaryModel,
    newInboundMessagesFn: deps.newInboundMessagesFn ?? newInboundMessages
  };
}

/**
 * Return only the messages that arrived after the last assistant turn.
 * This is used to decide what should be persisted as new user/tool input.
 */
export function newInboundMessages(messages: BaseMessage[]): BaseMessage[] {
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

/**
 * Build a lightweight graph wrapper around the orchestrator for streaming and invoke flows.
 */
export async function buildGraph(ctx: LegacyGraphContext, deps: BuildGraphDeps = {}) {
  const { createOrchestratorFn, getPrimaryModelFn, newInboundMessagesFn } = resolveGraphDeps(deps);

  const responseModel = ctx.responseModel ?? ctx.model ?? (await getPrimaryModelFn("response"));
  const intentModel = ctx.intentModel ?? (await getPrimaryModelFn("intent", { fallback: [responseModel] }));
  const { orchestrator } = await createOrchestratorFn(ctx.recordKeeper, { intentModel, responseModel });

  const runWithDetails = async (input: { messages: BaseMessage[] }) => {
    const persistable = newInboundMessagesFn(input.messages);
    const historyLength = input.messages.filter((msg) => (msg as { _getType?: () => string })._getType?.() !== "system")
      .length;
    const runInput: OrchestratorRunInput = {
      conversationId: ctx.conversationId,
      incoming: input.messages,
      persistable,
      intentInput: {},
      memoryInput: {},
      requestId: ctx.requestId
    };
    if (ctx.turnId) runInput.turnId = ctx.turnId;

    const result = await orchestrator.run(runInput);
    const messages = [...input.messages, result.response.message];
    return { ...result, messages, historyLength, transcript: result.intent.transcript };
  };

  const invoke = async (input: { messages: BaseMessage[] }) => {
    const result = await runWithDetails(input);
    return { messages: result.messages };
  };

  const stream = async function* (input: { messages: BaseMessage[] }) {
    const res = await invoke(input);
    yield { messages: res.messages };
  };

  return { invoke, runWithDetails, stream };
}


