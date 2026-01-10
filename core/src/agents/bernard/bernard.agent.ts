import { ClearToolUsesEdit, contextEditingMiddleware, createAgent, createMiddleware, modelRetryMiddleware, toolCallLimitMiddleware, toolRetryMiddleware } from "langchain";

import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { initChatModel } from "langchain/chat_models/universal";

import { getSettings } from "@/lib/config/settingsCache";
import { resolveModel } from "@/lib/config/models";

import { buildReactSystemPrompt } from "./prompts/react.prompt";
import { validateAndGetTools } from "./tools";
import { startUtilityWorker } from "@/lib/infra/queue";


startUtilityWorker();

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
      contextEditingMiddleware({
        edits: [
          new ClearToolUsesEdit({
            trigger: [
              { tokens: 50000, messages: 50 },
            ],
            keep: { messages: 20 },
          }),
        ],
      }),
    ],
  });
}

export const agent = await createBernardAgent();
