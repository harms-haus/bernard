import { ClearToolUsesEdit, contextEditingMiddleware, createAgent, createMiddleware, modelRetryMiddleware, toolCallLimitMiddleware, toolRetryMiddleware } from "langchain";

import { RedisSaver } from "../../lib/checkpoint/index";
import { initChatModel } from "langchain/chat_models/universal";

import { getSettings } from "../../lib/config/settingsCache";
import { resolveModel } from "../../lib/config/models";

import { buildReactSystemPrompt } from "../bernard/prompts/react.prompt";
import { getGuestToolDefinitions } from "../bernard/tools/validation";
import { startWorker } from "../../lib/infra/worker-queue";
import { startHealthMonitor } from "../../lib/services/HealthMonitor";
import { initializeSettingsStore } from "../../lib/config/settingsStore";
import { getRedis } from "../../lib/infra/redis";

// ============================================================================
// Initialization State
// ============================================================================

let initialized = false;
let initializingPromise: Promise<void> | undefined = undefined;

/**
 * Initialize agent services (utility worker and health monitor).
 * Safe to call multiple times - will only run once.
 * Returns a promise that resolves when initialization is complete.
 */
export function initializeGertrudeAgentServices(): Promise<void> {
  if (initialized) {
    return Promise.resolve();
  }
  
  if (initializingPromise) {
    return initializingPromise;
  }

  initializingPromise = (async () => {
    try {
      await initializeSettingsStore(undefined, getRedis());
      startWorker();
      startHealthMonitor();
      initialized = true;
    } catch (err) {
      console.error('[Gertrude] Failed to initialize settings store:', err);
      throw err;
    }
  })();

  return initializingPromise;
}

// ============================================================================
// Dependencies
// ============================================================================

export interface AgentDependencies {
  resolveModel: typeof resolveModel;
  initChatModel: typeof initChatModel;
  getSettings: typeof getSettings;
  RedisSaver: typeof RedisSaver;
  buildReactSystemPrompt: typeof buildReactSystemPrompt;
}

const defaultDependencies: AgentDependencies = {
  resolveModel,
  initChatModel,
  getSettings,
  RedisSaver,
  buildReactSystemPrompt,
};

// ============================================================================
// Agent Creation
// ============================================================================

export async function createGertrudeAgent(
  overrides?: Partial<AgentDependencies>
) {
  const deps = { ...defaultDependencies, ...overrides };

  // Create model once and reuse
  const createModel = async () => {
    const { id, options } = await deps.resolveModel("gertrude_agent", "main");
    return await deps.initChatModel(id, options);
  };

  // Create the model instance once at startup
  const model = await createModel();

  const modelware = createMiddleware({
    name: "DynamicModel",
    wrapModelCall: (request, handler) => {
      // Use the pre-created model instance instead of creating a new one each time
      return handler({
        ...request,
        model,
      });
    },
  });

  const settings = await deps.getSettings();
  const redisUrl = settings.services?.infrastructure?.redisUrl ?? "redis://localhost:6379";
  const checkpointer = await deps.RedisSaver.fromUrl(redisUrl);

  // Gertrude uses guest-only tools (no HA control, no media tools)
  const guestToolDefinitions = getGuestToolDefinitions();
  const disabledTools: Array<{ name: string; reason?: string }> = [];

  // Validate guest tools
  const validTools = [];
  for (const definition of guestToolDefinitions) {
    try {
      const result = await definition.factory();
      if (result.ok) {
        validTools.push(result.tool);
      } else {
        disabledTools.push({ name: result.name, reason: result.reason });
      }
    } catch (error) {
      disabledTools.push({
        name: definition.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return createAgent({
    model,
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
initializeGertrudeAgentServices();

// Lazy-loaded agent for LangGraph server compatibility
// Using a getter function to avoid top-level await in CJS context
let _agent: ReturnType<typeof createGertrudeAgent> | undefined = undefined;

export function getGertrudeAgent(): ReturnType<typeof createGertrudeAgent> {
  if (!_agent) {
    _agent = createGertrudeAgent();
  }
  return _agent;
}

/**
 * Default agent instance for backward compatibility.
 * Note: This returns a Promise, callers must await it.
 */
export const agent = getGertrudeAgent();
