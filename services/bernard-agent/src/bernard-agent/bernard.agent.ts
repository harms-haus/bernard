import { createAgent, createMiddleware, modelRetryMiddleware, toolCallLimitMiddleware, toolRetryMiddleware } from "langchain";

import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { initChatModel } from "langchain/chat_models/universal";

import { getSettings } from "@/lib/config/settingsCache";
import { resolveModel } from "@/lib/config/models";

import { buildReactSystemPrompt } from "./prompts/react.prompt";
import { validateAndGetTools } from "./tools";

// Start the utility queue worker
startUtilityQueueWorker();

async function startUtilityQueueWorker() {
  try {
    const { startUtilityWorker } = await import("@/lib/infra/queue");
    await startUtilityWorker();
  } catch (error) {
    console.error("[BernardAgent] Failed to start utility worker:", error);
  }
}

export async function createBernardAgent() {

  const createModel = async () => {
    const {id, options} = await resolveModel("router");
    return await initChatModel(id, options);
  }
  const modelware = createMiddleware({
    name: "DynamicModel",
    wrapModelCall: async (request, handler) => {
      const model = await createModel();
      
      return handler({
        ...request,
        model,
      });
    },
  });
  
  const settings = await getSettings();
  const redisUrl = settings.services?.infrastructure?.redisUrl ?? "redis://localhost:6379";
  const checkpointer = await RedisSaver.fromUrl(redisUrl);

  const { validTools, disabledTools } = await validateAndGetTools();

  return createAgent({
    model: await createModel(),
    tools: validTools,
    systemPrompt: buildReactSystemPrompt(new Date(), [], disabledTools),
    checkpointer,
    middleware: [
      modelware,
      toolCallLimitMiddleware({ runLimit: 10}),
      toolRetryMiddleware({ maxRetries: 3, backoffFactor: 2, initialDelayMs: 1000}),
      modelRetryMiddleware({ maxRetries: 3, backoffFactor: 2, initialDelayMs: 1000}),
      // contextEditingMiddleware({
      //   edits: [
      //     new ClearToolUsesEdit({
      //       trigger: [
      //         { tokens: 50000, messages: 20 },
      //       ],
      //       keep: { messages: 10 },
      //     }),
      //   ],
      // }),
    ],
  });
}

export const agent = await createBernardAgent();
