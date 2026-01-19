import { ClearToolUsesEdit, contextEditingMiddleware, createAgent, createMiddleware, modelRetryMiddleware, toolCallLimitMiddleware, toolRetryMiddleware } from "langchain";

import { RedisSaver } from "../../lib/checkpoint/index.js";
import { initChatModel } from "langchain/chat_models/universal";

import { getSettings } from "../../lib/config/settingsCache.js";
import { resolveModel } from "../../lib/config/models.js";

import { buildReactSystemPrompt } from "./prompts/react.prompt.js";
import { validateAndGetTools } from "./tools/index.js";
import { ToolContext } from "./tools/types.js";
import { startUtilityWorker } from "../../lib/infra/queue.js";
import { startHealthMonitor } from "../../lib/services/HealthMonitor.js";
import { initializeSettingsStore } from "../../lib/config/settingsStore.js";
import { getRedis } from "../../lib/infra/redis.js";

// ============================================================================
// Initialization State
// ============================================================================

let initialized = false;

/**
 * Initialize agent services (utility worker and health monitor).
 * Safe to call multiple times - will only run once.
 */
export function initializeAgentServices(): void {
  if (!initialized) {
    initializeSettingsStore(undefined, getRedis()).catch(err => {
      console.error('[Bernard] Failed to initialize settings store:', err);
    });
    startUtilityWorker();
    startHealthMonitor();
    initialized = true;
  }
}

// ============================================================================
// Dependencies
// ============================================================================

export interface AgentDependencies {
  resolveModel: typeof resolveModel;
  initChatModel: typeof initChatModel;
  getSettings: typeof getSettings;
  validateAndGetTools: typeof validateAndGetTools;
  RedisSaver: typeof RedisSaver;
  buildReactSystemPrompt: typeof buildReactSystemPrompt;
}

const defaultDependencies: AgentDependencies = {
  resolveModel,
  initChatModel,
  getSettings,
  validateAndGetTools,
  RedisSaver,
  buildReactSystemPrompt,
};

// ============================================================================
// Agent Creation
// ============================================================================

export async function createBernardAgent(
  overrides?: Partial<AgentDependencies>,
  toolContext?: ToolContext
) {
  const deps = { ...defaultDependencies, ...overrides };

  const createModel = async () => {
    const { id, options } = await deps.resolveModel("router");
    return await deps.initChatModel(id, options);
  };

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

  const settings = await deps.getSettings();
  const redisUrl = settings.services?.infrastructure?.redisUrl ?? "redis://localhost:6379";
  const checkpointer = await deps.RedisSaver.fromUrl(redisUrl);

  const { validTools, disabledTools } = await deps.validateAndGetTools(toolContext);

  return createAgent({
    model: await createModel(),
    tools: validTools,
    systemPrompt: deps.buildReactSystemPrompt(new Date(), [], disabledTools),
    checkpointer,
    middleware: [
      modelware,
      toolCallLimitMiddleware({ runLimit: 10 }),
      toolRetryMiddleware({ maxRetries: 3, backoffFactor: 2, initialDelayMs: 1000 }),
      modelRetryMiddleware({ maxRetries: 3, backoffFactor: 2, initialDelayMs: 1000 }),
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

// ============================================================================
// Module Initialization
// ============================================================================

// Initialize services when module loads
initializeAgentServices();

// Lazy-loaded agent for LangGraph server compatibility
// Using a getter function to avoid top-level await in CJS context
let _agent: ReturnType<typeof createBernardAgent> | undefined = undefined;

export function getBernardAgent(): ReturnType<typeof createBernardAgent> {
  if (!_agent) {
    _agent = createBernardAgent();
  }
  return _agent;
}

/**
 * Default agent instance for backward compatibility.
 * Note: This returns a Promise, callers must await it.
 */
export const agent = getBernardAgent();
