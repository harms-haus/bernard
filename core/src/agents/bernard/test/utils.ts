/**
 * Test utilities for Bernard agent testing.
 * 
 * Provides mock factories, test helpers, and configuration overrides
 * for testing tools and agent components without external dependencies.
 */

import { vi, type Mock } from 'vitest';
import type { StructuredTool } from '@langchain/core/tools';
import { type LangGraphRunnableConfig } from '@langchain/langgraph';
import type { BernardSettings } from '@/lib/config/settingsStore';
import type { ModelCategorySettings } from '@/lib/config/appSettings';
import type { WeatherServiceSettings } from '@/lib/config/appSettings';
import type { KokoroServiceSettings } from '@/lib/config/appSettings';

// ============================================================================
// Mock Settings
// ============================================================================

function createModelCategorySettings(overrides: Partial<ModelCategorySettings> = {}): ModelCategorySettings {
  return {
    primary: 'gpt-4o',
    providerId: 'openai',
    options: {
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 4096,
    },
    ...overrides,
  };
}

function createWeatherSettings(overrides: Partial<WeatherServiceSettings> = {}): WeatherServiceSettings {
  return {
    provider: 'openweathermap',
    apiKey: 'test-weather-key',
    apiUrl: 'https://api.openweathermap.org',
    ...overrides,
  };
}

function createKokoroSettings(overrides: Partial<KokoroServiceSettings> = {}): KokoroServiceSettings {
  return {
    baseUrl: 'http://kokoro:8880',
    ...overrides,
  };
}

/**
 * Create a mock BernardSettings object for testing.
 * All required services have test configuration.
 */
export function createMockSettings(overrides: Partial<BernardSettings> = {}): BernardSettings {
  return {
    services: {
      memory: {
        embeddingModel: 'text-embedding-3-small',
        embeddingBaseUrl: 'http://vllm:8080',
      },
      search: {
        apiUrl: 'https://search.example.com',
        apiKey: 'test-search-key',
      },
      weather: createWeatherSettings(),
      geocoding: {
        url: 'https://geocoding.example.com',
      },
      homeAssistant: {
        baseUrl: 'http://homeassistant:8123',
        accessToken: 'test-ha-token',
      },
      plex: {
        baseUrl: 'http://plex:32400',
        token: 'test-plex-token',
      },
      kokoro: createKokoroSettings(),
      tts: {
        baseUrl: 'http://kokoro:8880',
      },
      stt: {
        baseUrl: 'http://whisper:8870',
      },
      overseerr: {
        baseUrl: 'http://overseerr:5055',
        apiKey: 'test-overseerr-key',
      },
      infrastructure: {
        redisUrl: 'redis://localhost:6379',
      },
      ...overrides.services,
    },
    models: {
      providers: [],
      response: createModelCategorySettings(),
      router: createModelCategorySettings(),
      memory: createModelCategorySettings(),
      utility: createModelCategorySettings(),
      ...overrides.models,
    },
    oauth: {
      default: {
        authUrl: 'https://oauth.example.com/auth',
        tokenUrl: 'https://oauth.example.com/token',
        userInfoUrl: 'https://oauth.example.com/userinfo',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scope: 'openid profile email',
        clientId: 'test-client',
        clientSecret: 'test-secret',
      },
      google: {
        authUrl: 'https://google.com/auth',
        tokenUrl: 'https://google.com/token',
        userInfoUrl: 'https://google.com/userinfo',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scope: 'openid profile email',
        clientId: 'test-google-client',
        clientSecret: 'test-google-secret',
      },
      github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        redirectUri: 'http://localhost:3456/api/auth/callback',
        scope: 'read:user user:email',
        clientId: 'test-github-client',
        clientSecret: 'test-github-secret',
      },
      ...overrides.oauth,
    },
    backups: {
      debounceSeconds: 300,
      directory: './backups',
      retentionDays: 30,
      retentionCount: 10,
      ...overrides.backups,
    },
    limits: {
      currentRequestMaxTokens: 8192,
      responseMaxTokens: 4096,
      allowUserCreation: true,
      ...overrides.limits,
    },
    automations: {},
    ...overrides,
  };
}

/**
 * Create mock settings with specific services disabled.
 */
export function createMockSettingsWithDisabled(services: (keyof BernardSettings['services'])[]): BernardSettings {
  const settings = createMockSettings();
  
  for (const service of services) {
    if (service in settings.services) {
      // @ts-expect-error - dynamic service disable
      settings.services[service] = null;
    }
  }
  
  return settings;
}

// ============================================================================
// Mock HTTP Client
// ============================================================================

export interface MockHttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: Record<string, unknown>;
  text?: string;
}

/**
 * Create a mock HTTP response.
 */
export function createMockHttpResponse(options: Partial<MockHttpResponse> = {}): MockHttpResponse {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    json: options.json ?? {},
    text: options.text,
  };
}

// ============================================================================
// Mock Progress Reporter
// ============================================================================

export interface MockProgressReporter {
  reports: string[];
  resetCalled: boolean;
}

/**
 * Create a mock progress reporter for tracking tool progress calls.
 */
export function createMockProgressReporter(): MockProgressReporter {
  const state = {
    reports: [] as string[],
    resetCalled: false,
  };

  return state;
}

// Type for the writer callback used by LangGraph
interface ProgressWriterData {
  _type: string;
  tool: string;
  phase: string;
  message: string;
}

export interface MockRunnableConfigResult {
  config: {
    configurable: {
      thread_id: string;
    };
    writer?: (data: ProgressWriterData) => void;
  };
  state: MockProgressReporter;
}

/**
 * Create a mock RunnableConfig with progress reporter.
 * Note: Uses Object.defineProperty to add 'writer' which is accessed via config['writer'] in LangGraph.
 */
export function createMockRunnableConfig(toolName: string = 'test_tool'): MockRunnableConfigResult {
  const state = createMockProgressReporter();

  const writer = (data: ProgressWriterData) => {
    if (data._type === 'tool_progress' && data.tool === toolName) {
      if (data.phase === 'step') {
        state.reports.push(data.message);
      } else if (data.phase === 'complete') {
        state.resetCalled = true;
      }
    }
  };

  // Create config with writer property (LangGraph uses config['writer'] access)
  const config = {
    configurable: {
      thread_id: 'test-thread',
    },
  };

  // Add writer as a property that can be accessed via config['writer']
  Object.defineProperty(config, 'writer', {
    value: writer,
    writable: true,
    enumerable: true,
  });

  return { config, state };
}

// ============================================================================
// Mock Redis Client
// ============================================================================

export interface MockRedisClient {
  get: Mock;
  set: Mock;
  del: Mock;
  hget: Mock;
  hset: Mock;
  hgetall: Mock;
  keys: Mock;
  multi: Mock;
  quit: Mock;
}

/**
 * Create a mock Redis client for testing.
 */
export function createMockRedisClient(): MockRedisClient {
  const client: MockRedisClient = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    hget: vi.fn().mockResolvedValue(null),
    hset: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue({}),
    keys: vi.fn().mockResolvedValue([]),
    multi: vi.fn().mockReturnThis(),
    quit: vi.fn().mockResolvedValue('OK'),
  };
  
  return client;
}

// ============================================================================
// Mock Home Assistant
// ============================================================================

export interface MockEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

/**
 * Create a mock Home Assistant entity state.
 */
export function createMockEntityState(overrides: Partial<MockEntityState> = {}): MockEntityState {
  return {
    entity_id: 'light.test_light',
    state: 'off',
    attributes: {
      friendly_name: 'Test Light',
      supported_color_modes: ['rgb', 'hs', 'xy'],
      brightness: 255,
      ...overrides.attributes,
    },
    ...overrides,
  };
}

/**
 * Create mock Home Assistant service calls for testing.
 */
export function createMockHomeAssistantService(): {
  getEntityState: Mock;
  callService: Mock;
  getEntities: Mock;
  verifyConfigured: Mock;
} {
  return {
    getEntityState: vi.fn().mockResolvedValue(createMockEntityState()),
    callService: vi.fn().mockResolvedValue(undefined),
    getEntities: vi.fn().mockResolvedValue(['light.test_light']),
    verifyConfigured: vi.fn().mockResolvedValue({ ok: true }),
  };
}

// ============================================================================
// Mock Overseerr Client
// ============================================================================

export interface MockOverseerrSearchResult {
  id: number;
  title: string;
  overview: string;
  releaseDate: string;
  mediaType: 'movie' | 'tv';
  status: string;
}

/**
 * Create mock Overseerr search results.
 */
export function createMockOverseerrResults(): MockOverseerrSearchResult[] {
  return [
    {
      id: 1,
      title: 'Test Movie',
      overview: 'A test movie overview',
      releaseDate: '2024-01-01',
      mediaType: 'movie',
      status: 'available',
    },
    {
      id: 2,
      title: 'Test TV Show',
      overview: 'A test TV show overview',
      releaseDate: '2024-01-01',
      mediaType: 'tv',
      status: 'requested',
    },
  ];
}

/**
 * Create mock Overseerr client for testing.
 */
export function createMockOverseerrClient(): {
  search: Mock;
  getMovie: Mock;
  getTvShow: Mock;
  verifyConfigured: Mock;
} {
  const results = createMockOverseerrResults();
  
  return {
    search: vi.fn().mockResolvedValue({ results }),
    getMovie: vi.fn().mockResolvedValue({ movie: results[0] }),
    getTvShow: vi.fn().mockResolvedValue({ tvShow: results[1] }),
    verifyConfigured: vi.fn().mockResolvedValue({ ok: true }),
  };
}

// ============================================================================
// Mock Search Service
// ============================================================================

export interface MockSearchResult {
  title: string;
  url: string;
  description: string;
}

/**
 * Create mock search results.
 */
export function createMockSearchResults(): MockSearchResult[] {
  return [
    {
      title: 'Result 1',
      url: 'https://example.com/1',
      description: 'Description 1',
    },
    {
      title: 'Result 2',
      url: 'https://example.com/2',
      description: 'Description 2',
    },
  ];
}

/**
 * Create mock search service for testing.
 */
export function createMockSearchService(): {
  executeSearch: Mock;
  verifyConfigured: Mock;
  resolveConfig: Mock;
} {
  return {
    executeSearch: vi.fn().mockResolvedValue('1. Result 1 — https://example.com/1 :: Description 1\n2. Result 2 — https://example.com/2 :: Description 2'),
    verifyConfigured: vi.fn().mockResolvedValue({ ok: true }),
    resolveConfig: vi.fn().mockResolvedValue({
      ok: true,
      apiUrl: 'https://search.example.com',
      apiKey: 'test-key',
      provider: 'searxng' as const,
    }),
  };
}

// ============================================================================
// Mock Task Context (for timer tool)
// ============================================================================

export interface MockTaskContext {
  conversationId: string;
  userId: string;
  createTask: Mock;
}

/**
 * Create mock task context for timer tool testing.
 */
export function createMockTaskContext(): MockTaskContext {
  return {
    conversationId: 'test-conversation',
    userId: 'test-user',
    createTask: vi.fn().mockResolvedValue({ taskId: 'task-123', taskName: 'timer' }),
  };
}

// ============================================================================
// Mock Tool Factory Result
// ============================================================================

/**
 * Create a mock tool factory result for testing.
 */
export function createMockToolFactoryResult(
  options: { ok: true; tool: StructuredTool } | { ok: false; name: string; reason: string }
) {
  return options;
}

// ============================================================================
// Mock LangChain Components
// ============================================================================

/**
 * Create a mock StructuredTool for testing.
 */
export function createMockStructuredTool(overrides: Partial<StructuredTool> = {}): StructuredTool {
  return {
    name: overrides.name ?? 'mock_tool',
    description: overrides.description ?? 'A mock tool for testing',
    schema: overrides.schema ?? { type: 'object', properties: {} },
    invoke: overrides.invoke ?? vi.fn().mockResolvedValue('mock result'),
    ...overrides,
  } as StructuredTool;
}

// ============================================================================
// Test Data Factories
// ============================================================================

export interface TimerValidationTestCase {
  name: string;
  input: { name: unknown; time: unknown; message: unknown };
  expectedOk: boolean;
  expectedReason?: string;
}

/**
 * Factory for creating timer validation test cases.
 */
export function createTimerValidationTestCases(): TimerValidationTestCase[] {
  return [
    {
      name: 'valid params',
      input: { name: 'test timer', time: 60, message: 'Test message' },
      expectedOk: true,
    },
    {
      name: 'empty name',
      input: { name: '', time: 60, message: 'Test message' },
      expectedOk: false,
      expectedReason: 'name parameter is required',
    },
    {
      name: 'whitespace name',
      input: { name: '   ', time: 60, message: 'Test message' },
      expectedOk: false,
      expectedReason: 'name parameter is required',
    },
    {
      name: 'non-string name',
      input: { name: 123, time: 60, message: 'Test message' },
      expectedOk: false,
      expectedReason: 'name parameter is required',
    },
    {
      name: 'zero time',
      input: { name: 'timer', time: 0, message: 'Test message' },
      expectedOk: false,
      expectedReason: 'time must be positive',
    },
    {
      name: 'negative time',
      input: { name: 'timer', time: -10, message: 'Test message' },
      expectedOk: false,
      expectedReason: 'time must be positive',
    },
    {
      name: 'time exceeds max',
      input: { name: 'timer', time: 7200, message: 'Test message' },
      expectedOk: false,
      expectedReason: 'time cannot exceed 3600 seconds',
    },
    {
      name: 'non-number time',
      input: { name: 'timer', time: '60' as unknown as number, message: 'Test message' },
      expectedOk: false,
      expectedReason: 'time must be positive',
    },
    {
      name: 'missing message',
      input: { name: 'timer', time: 60, message: undefined },
      expectedOk: false,
      expectedReason: 'message is required',
    },
    {
      name: 'non-string message',
      input: { name: 'timer', time: 60, message: 123 as unknown as string },
      expectedOk: false,
      expectedReason: 'message is required',
    },
  ];
}

export interface EntityValidationTestCase {
  name: string;
  input: string;
  expectedOk: boolean;
  expectedError?: string;
}

/**
 * Factory for creating entity validation test cases (Home Assistant).
 */
export function createEntityValidationTestCases(): EntityValidationTestCase[] {
  return [
    {
      name: 'valid light entity',
      input: 'light.living_room',
      expectedOk: true,
    },
    {
      name: 'valid entity with underscores',
      input: 'light.my_awesome_light',
      expectedOk: true,
    },
    {
      name: 'valid entity with numbers',
      input: 'light.lamp123',
      expectedOk: true,
    },
    {
      name: 'empty string',
      input: '',
      expectedOk: false,
      expectedError: "Invalid entity_id format: . Entity IDs must be in format 'domain.entity_name'",
    },
    {
      name: 'missing domain',
      input: 'living_room',
      expectedOk: false,
      expectedError: "Invalid entity_id format: living_room. Entity IDs must be in format 'domain.entity_name'",
    },
    {
      name: 'too many parts',
      input: 'light.living_room.extra',
      expectedOk: false,
      expectedError: "Invalid entity_id format: light.living_room.extra. Entity IDs must be in format 'domain.entity_name'",
    },
    {
      name: 'wrong domain',
      input: 'switch.living_room',
      expectedOk: false,
      expectedError: 'Entity switch.living_room is not a light. Only light entities are supported by this tool.',
    },
    {
      name: 'non-light domain',
      input: 'climate.living_room',
      expectedOk: false,
      expectedError: 'Entity climate.living_room is not a light. Only light entities are supported by this tool.',
    },
  ];
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that two objects are equal (deep comparison).
 */
export function assertDeepEqual(actual: unknown, expected: unknown, message?: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  
  if (actualStr !== expectedStr) {
    throw new Error(`${message ?? 'Assertion failed'}: expected ${expectedStr}, got ${actualStr}`);
  }
}

/**
 * Assert that a value is truthy.
 */
export function assertTrue(value: unknown, message: string = 'Expected truthy value'): void {
  if (!value) {
    throw new Error(message);
  }
}

/**
 * Assert that a value is falsy.
 */
export function assertFalse(value: unknown, message: string = 'Expected falsy value'): void {
  if (value) {
    throw new Error(message);
  }
}

/**
 * Assert that a function throws an error with specific message.
 */
export function assertThrows(fn: () => void, expectedMessage?: string): void {
  let threw = false;
  let error: Error | undefined;
  
  try {
    fn();
  } catch (e) {
    threw = true;
    error = e as Error;
  }
  
  if (!threw) {
    throw new Error(`Expected function to throw, but it did not`);
  }
  
  if (expectedMessage && !error?.message.includes(expectedMessage)) {
    throw new Error(`Expected error message to contain "${expectedMessage}", got "${error?.message}"`);
  }
}

// ============================================================================
// Setup/Teardown Helpers
// ============================================================================

/**
 * Reset all mocks created by this module.
 */
export function resetMocks(): void {
  vi.restoreAllMocks();
}

/**
 * Clear the module cache for a specific path.
 * Useful for testing module re-import scenarios.
 */
export function clearModuleCache(modulePath: string): void {
  const module = require.cache[require.resolve(modulePath)];
  if (module) {
    delete require.cache[require.resolve(modulePath)];
  }
}

/**
 * Clear all module caches matching a pattern.
 */
export function clearModuleCachePattern(pattern: RegExp): void {
  const pathsToDelete: string[] = [];
  
  for (const key of Object.keys(require.cache)) {
    if (pattern.test(key)) {
      pathsToDelete.push(key);
    }
  }
  
  for (const path of pathsToDelete) {
    delete require.cache[path];
  }
}
