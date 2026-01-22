/**
 * Tests for Bernard agent creation and orchestration.
 * Note: Tests that require SettingsManagerCore initialization are mocked at the top level.
 */

// ============================================================================
// Mocks - MUST be at the top before any imports to prevent module-level code from failing
// ============================================================================

// Mock settingsCache to prevent SettingsStoreCore error during module import
// The module-level `export const agent = await createBernardAgent()` in bernard.agent.ts
// calls getSettings() which creates a SettingsStore requiring SettingsManagerCore
vi.mock('@/lib/config/settingsCache', () => ({
  getSettings: vi.fn().mockResolvedValue({
    services: {
      infrastructure: {
        redisUrl: 'redis://localhost:6379',
      },
    },
    models: {
      utility: {
        primary: 'gpt-3.5-turbo',
        providerId: 'openai-default',
        options: { temperature: 0 },
      },
      agents: [
        {
          agentId: 'bernard_agent',
          roles: [
            {
              id: 'main',
              primary: 'gpt-4o',
              providerId: 'openai-default',
              options: { temperature: 0.2 },
            }
          ]
        }
      ],
      providers: [
        {
          id: 'openai-default',
          type: 'openai',
          name: 'OpenAI',
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  }),
  clearSettingsCache: vi.fn(),
}));

// Mock models.ts to prevent resolveModel from failing during module import
vi.mock('@/lib/config/models', () => ({
  resolveModel: vi.fn().mockResolvedValue({
    id: 'gpt-4o',
    options: { temperature: 0.2 },
  }),
  setSettingsFetcher: vi.fn(),
  resetSettingsFetcher: vi.fn(),
  DEFAULT_MODEL_ID: 'gpt-3.5-turbo',
}));

// Mock langchain/chat_models/universal for initChatModel
vi.mock('langchain/chat_models/universal', () => ({
  initChatModel: vi.fn().mockResolvedValue({}),
}));

// Mock checkpoint module for RedisSaver
vi.mock('@/lib/checkpoint', () => ({
  RedisSaver: {
    fromUrl: vi.fn().mockResolvedValue({ get: vi.fn(), put: vi.fn() }),
  },
}));

// Mock the tools module for validateAndGetTools
vi.mock('./tools', () => ({
  validateAndGetTools: vi.fn().mockResolvedValue({
    validTools: [],
    disabledTools: [],
  }),
}));

// Mock the prompts module for buildReactSystemPrompt
vi.mock('./prompts/react.prompt', () => ({
  buildReactSystemPrompt: vi.fn().mockReturnValue('You are a helpful assistant.'),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StructuredTool } from '@langchain/core/tools';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { AgentDependencies } from './bernard.agent';
import {
  createBernardAgent,
  initializeAgentServices,
} from './bernard.agent';

// Mock langchain createAgent function
vi.mock('langchain', () => ({
  createAgent: vi.fn(),
  createMiddleware: vi.fn(),
  toolCallLimitMiddleware: vi.fn(),
  toolRetryMiddleware: vi.fn(),
  modelRetryMiddleware: vi.fn(),
  contextEditingMiddleware: vi.fn(),
  ClearToolUsesEdit: vi.fn(),
}));

// Import the mocked createAgent function
import { createAgent as mockCreateAgent } from 'langchain';
const mockCreateAgentFn = mockCreateAgent as ReturnType<typeof vi.fn>;

describe.skip('BernardAgent', () => {
  describe('initializeAgentServices', () => {
    it('should be a function', () => {
      expect(typeof initializeAgentServices).toBe('function');
    });
  });

  describe('AgentDependencies interface', () => {
    it('should have all required dependency types', () => {
      const mockDeps: AgentDependencies = {
        resolveModel: vi.fn().mockResolvedValue({ id: 'test', options: {} }),
        initChatModel: vi.fn().mockResolvedValue({} as unknown as BaseChatModel),
        getSettings: vi.fn().mockResolvedValue({}),
        validateAndGetTools: vi.fn().mockResolvedValue({
          validTools: [],
          disabledTools: [],
        }),
        RedisSaver: {
          fromUrl: vi.fn().mockResolvedValue({} as unknown as BaseCheckpointSaver),
        } as unknown as typeof import('@/lib/checkpoint').RedisSaver,
        buildReactSystemPrompt: vi.fn().mockReturnValue('test prompt'),
      };

      expect(mockDeps.resolveModel).toBeDefined();
      expect(mockDeps.initChatModel).toBeDefined();
      expect(mockDeps.getSettings).toBeDefined();
      expect(mockDeps.validateAndGetTools).toBeDefined();
      expect(mockDeps.RedisSaver).toBeDefined();
      expect(mockDeps.buildReactSystemPrompt).toBeDefined();
    });
  });

  describe('createBernardAgent', () => {
    let mockResolveModel: ReturnType<typeof vi.fn>;
    let mockInitChatModel: ReturnType<typeof vi.fn>;
    let mockGetSettings: ReturnType<typeof vi.fn>;
    let mockValidateAndGetTools: ReturnType<typeof vi.fn>;
    let mockRedisSaverFromUrl: ReturnType<typeof vi.fn>;
    let mockBuildReactSystemPrompt: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockResolveModel = vi.fn().mockResolvedValue({
        id: 'test-model',
        options: { temperature: 0.2 },
      });

      mockInitChatModel = vi.fn().mockResolvedValue({
        name: 'TestModel',
      } as unknown as BaseChatModel);

      mockGetSettings = vi.fn().mockResolvedValue({
        services: {
          infrastructure: {
            redisUrl: 'redis://localhost:6379',
          },
        },
      });

      mockValidateAndGetTools = vi.fn().mockResolvedValue({
        validTools: [],
        disabledTools: [],
      });

      mockRedisSaverFromUrl = vi.fn().mockResolvedValue({
        get: vi.fn(),
        put: vi.fn(),
      } as unknown as BaseCheckpointSaver);

      mockBuildReactSystemPrompt = vi.fn().mockReturnValue('You are a helpful assistant.');

      // Setup the mocked createAgent function
      mockCreateAgentFn.mockResolvedValue({ invoke: vi.fn(), stream: vi.fn() });

      // Mock the RedisSaver module
      vi.doMock('@/lib/checkpoint', () => ({
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        },
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return a promise that resolves to an agent', async () => {
      const agentPromise = createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(agentPromise).toBeInstanceOf(Promise);

      const agent = await agentPromise;
      expect(agent).toBeDefined();
      expect(typeof agent.invoke).toBe('function');
      expect(typeof agent.stream).toBe('function');
    });

    it('should call resolveModel with bernard_agent and main role', async () => {
      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockResolveModel).toHaveBeenCalledWith('bernard_agent', 'main');
    });

    it('should call initChatModel with resolved model id and options', async () => {
      const modelId = 'test-model-id';
      const modelOptions = { temperature: 0.5 };

      mockResolveModel.mockResolvedValueOnce({
        id: modelId,
        options: modelOptions,
      });

      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockInitChatModel).toHaveBeenCalledWith(modelId, modelOptions);
    });

    it('should get settings for Redis URL configuration', async () => {
      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockGetSettings).toHaveBeenCalled();
    });

    it('should use default Redis URL when not configured', async () => {
      mockGetSettings.mockReset();
      mockGetSettings.mockResolvedValueOnce({});

      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockRedisSaverFromUrl).toHaveBeenCalledWith('redis://localhost:6379');
    });

    it('should call validateAndGetTools to get tools', async () => {
      const mockTool = {
        name: 'test_tool',
        description: 'A test tool',
        schema: { type: 'object' },
        invoke: vi.fn(),
      } as unknown as StructuredTool;

      mockValidateAndGetTools.mockReset();
      mockValidateAndGetTools.mockResolvedValueOnce({
        validTools: [mockTool],
        disabledTools: [],
      });

      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockValidateAndGetTools).toHaveBeenCalled();
    });

    it('should pass valid tools to agent', async () => {
      const mockTool1 = { name: 'tool1' } as unknown as StructuredTool;
      const mockTool2 = { name: 'tool2' } as unknown as StructuredTool;

      mockValidateAndGetTools.mockReset();
      mockValidateAndGetTools.mockResolvedValueOnce({
        validTools: [mockTool1, mockTool2],
        disabledTools: [],
      });

      const agent = await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(agent).toBeDefined();
      expect(mockValidateAndGetTools).toHaveBeenCalled();
      expect(mockCreateAgentFn).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [mockTool1, mockTool2],
        })
      );
    });

    it('should pass disabled tools to system prompt builder', async () => {
      const disabledTools = [
        { name: 'disabled_tool', reason: 'Not configured' },
      ];

      mockValidateAndGetTools.mockReset();
      mockValidateAndGetTools.mockResolvedValueOnce({
        validTools: [],
        disabledTools,
      });

      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockBuildReactSystemPrompt).toHaveBeenCalledWith(
        expect.any(Date),
        [],
        disabledTools
      );
    });

    it('should call RedisSaver.fromUrl with configured Redis URL', async () => {
      const customRedisUrl = 'redis://custom:6379';

      mockGetSettings.mockReset();
      mockGetSettings.mockResolvedValueOnce({
        services: {
          infrastructure: {
            redisUrl: customRedisUrl,
          },
        },
      });

      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockRedisSaverFromUrl).toHaveBeenCalledWith(customRedisUrl);
    });

    it('should use custom resolveModel when provided', async () => {
      const customResolveModel = vi.fn().mockResolvedValue({
        id: 'custom-model',
        options: {},
      });

      await createBernardAgent({
        resolveModel: customResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(customResolveModel).toHaveBeenCalledWith('bernard_agent', 'main');
    });

    it('should call initChatModel for agent model', async () => {
      await createBernardAgent({
        resolveModel: mockResolveModel,
        initChatModel: mockInitChatModel,
        getSettings: mockGetSettings,
        validateAndGetTools: mockValidateAndGetTools,
        RedisSaver: {
          fromUrl: mockRedisSaverFromUrl,
        } as unknown as AgentDependencies['RedisSaver'],
        buildReactSystemPrompt: mockBuildReactSystemPrompt,
      });

      expect(mockInitChatModel).toHaveBeenCalledTimes(1);
    });
  });
});
