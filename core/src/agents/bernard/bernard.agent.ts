import { ClearToolUsesEdit, contextEditingMiddleware, createAgent, createMiddleware, modelRetryMiddleware, toolCallLimitMiddleware, toolRetryMiddleware, type MiddlewareResult } from "langchain";

import { RedisSaver } from "../../lib/checkpoint/index";
import { initChatModel } from "langchain/chat_models/universal";

import { getSettings } from "../../lib/config/settingsCache";
import { resolveModel } from "../../lib/config/models";

import { buildReactSystemPrompt } from "./prompts/react.prompt";
import { getGuestToolDefinitions, validateAndGetTools } from "./tools/index";
import { startUtilityWorker } from "../../lib/infra/queue";
import { startHealthMonitor } from "../../lib/services/HealthMonitor";
import { initializeSettingsStore } from "../../lib/config/settingsStore";
import { getRedis } from "../../lib/infra/redis";

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
// User Role Middleware
// ============================================================================

/**
 * Extract userRole from input and store in state for tools to access at runtime.
 * This allows tools to check the user's role without needing to modify the tool list.
 */
const userRoleMiddleware = createMiddleware({
  name: "UserRoleExtractor",
  beforeModel: (state): MiddlewareResult<{ userRole: string }> | undefined => {
    // userRole is passed in the input from proxy routes
    const directUserRole = (state as { userRole?: string }).userRole;
    if (directUserRole) {
      return { userRole: directUserRole };
    }
    return undefined;
  },
});

/**
 * Middleware that injects __userRole into tool call arguments.
 * This allows tools to check the user's role at runtime.
 */
const dynamicToolCallMiddleware = createMiddleware({
  name: "ToolSelector",
  wrapModelCall: (request, handler) => {
    const state = request.state as { userRole?: string };
    const userRole = state?.userRole ?? "guest";
    return handler({
      ...request,
      tools: userRole === 'guest' ? getGuestToolDefinitions() : request.tools,
    });
  },
});

// ============================================================================
// Agent Creation
// ============================================================================

export async function createBernardAgent(
  overrides?: Partial<AgentDependencies>
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

  const { validTools, disabledTools } = await deps.validateAndGetTools();

  return createAgent({
    model: await createModel(),
    tools: validTools,
    systemPrompt: deps.buildReactSystemPrompt(new Date(), [], disabledTools),
    checkpointer,
    middleware: [
      userRoleMiddleware,
      dynamicToolCallMiddleware,
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
