// core/src/test/mocks/library-mocks.ts
// Mock factories for library tests (Redis, BullMQ, Home Assistant, Plex, Overseerr, etc.)

import { vi, type Mock } from 'vitest';

// =============================================================================
// Redis Client Mock (ioredis)
// =============================================================================

export interface MockRedisClient {
  get: Mock;
  set: Mock;
  del: Mock;
  hgetall: Mock;
  hset: Mock;
  hget: Mock;
  hdel: Mock;
  keys: Mock;
  expire: Mock;
  ttl: Mock;
  ping: Mock;
  connect: Mock;
  disconnect: Mock;
  on: Mock;
  emit: Mock;
  quit: Mock;
  clone: () => MockRedisClient;
}

export const createMockRedisClient = (): MockRedisClient => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  hget: vi.fn().mockResolvedValue(null),
  hdel: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockResolvedValue([]),
  expire: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(-1),
  ping: vi.fn().mockResolvedValue('PONG'),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  emit: vi.fn(),
  quit: vi.fn().mockResolvedValue('OK'),
  clone: () => createMockRedisClient(),
});

export const createConnectedRedisMock = (): MockRedisClient => {
  const mock = createMockRedisClient();
  mock.ping.mockResolvedValue('PONG');
  mock.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'connect') handler();
    if (event === 'ready') handler();
    return mock;
  });
  return mock;
};

// =============================================================================
// BullMQ Mocks
// =============================================================================

export interface MockQueue {
  add: Mock;
  getJob: Mock;
  getJobs: Mock;
  clean: Mock;
  obliterate: Mock;
  close: Mock;
  on: Mock;
  name: string;
}

export interface MockWorker {
  on: Mock;
  close: Mock;
  process: Mock;
}

export interface MockQueueEvents {
  on: Mock;
  close: Mock;
}

export const createMockQueue = (name = 'test-queue'): MockQueue => ({
  name,
  add: vi.fn().mockResolvedValue({ id: 'job-123' }),
  getJob: vi.fn().mockResolvedValue(null),
  getJobs: vi.fn().mockResolvedValue([]),
  clean: vi.fn().mockResolvedValue([]),
  obliterate: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
});

export const createMockWorker = (): MockWorker => {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const mockWorker: MockWorker = {
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event)!.push(handler);
      return mockWorker;
    }),
    close: vi.fn().mockResolvedValue(undefined),
    process: vi.fn(),
  };
  return mockWorker;
};

export const createMockQueueEvents = (): MockQueueEvents => {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const mockQueueEvents: MockQueueEvents = {
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event)!.push(handler);
      return mockQueueEvents;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return mockQueueEvents;
};

// =============================================================================
// Home Assistant WebSocket Mock
// =============================================================================

export interface MockHAWebSocket {
  connect: Mock;
  disconnect: Mock;
  send: Mock;
  on: Mock;
  off: Mock;
  readyState: number;
}

export const createMockHAWebSocket = (): MockHAWebSocket => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
  readyState: 0,
});

export const createConnectedHAWebSocket = (): MockHAWebSocket => {
  const mock = createMockHAWebSocket();
  mock.readyState = 1;
  mock.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'ready') handler();
    if (event === 'connected') handler();
    return mock;
  });
  return mock;
};

// =============================================================================
// Plex Client Mock
// =============================================================================

export interface MockPlexClient {
  query: Mock;
  getServerInfo: Mock;
  getClients: Mock;
  playMedia: Mock;
  pausePlayback: Mock;
  seekTo: Mock;
}

export const createMockPlexClient = (): MockPlexClient => ({
  query: vi.fn().mockResolvedValue({ MediaContainer: {} }),
  getServerInfo: vi.fn().mockResolvedValue({ machineIdentifier: 'test-machine-id' }),
  getClients: vi.fn().mockResolvedValue({ MediaContainer: { Device: [] } }),
  playMedia: vi.fn().mockResolvedValue({ success: true }),
  pausePlayback: vi.fn().mockResolvedValue({ success: true }),
  seekTo: vi.fn().mockResolvedValue({ success: true }),
});

// =============================================================================
// Overseerr Client Mock
// =============================================================================

export interface MockOverseerrClient {
  search: Mock;
  createRequest: Mock;
  listRequests: Mock;
  deleteRequest: Mock;
  createIssue: Mock;
}

export const createMockOverseerrClient = (): MockOverseerrClient => ({
  search: vi.fn().mockResolvedValue({ results: [], totalResults: 0 }),
  createRequest: vi.fn().mockResolvedValue({ id: 123, status: 'pending' }),
  listRequests: vi.fn().mockResolvedValue({ results: [], totalResults: 0 }),
  deleteRequest: vi.fn().mockResolvedValue({ success: true }),
  createIssue: vi.fn().mockResolvedValue({ id: 456, status: 'open' }),
});

// =============================================================================
// Child Process Mock
// =============================================================================

export interface MockChildProcess {
  spawn: Mock;
  exec: Mock;
  kill: Mock;
  pid?: number;
}

export const createMockChildProcess = (): MockChildProcess => ({
  spawn: vi.fn().mockReturnValue({
    pid: 12345,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, handler: (code: number | null) => void) => {
      if (event === 'exit') handler(0);
    }),
  }),
  exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  kill: vi.fn().mockReturnValue(true),
});

// =============================================================================
// Pino Logger Mock
// =============================================================================

export interface MockPinoLogger {
  info: Mock;
  error: Mock;
  warn: Mock;
  debug: Mock;
  trace: Mock;
  fatal: Mock;
  child: Mock;
}

export const createMockLogger = (): MockPinoLogger => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockImplementation(() => createMockLogger()),
});

// =============================================================================
// Settings Mock
// =============================================================================

export const createMinimalMockSettings = () => ({
  models: {
    providers: [{
      id: 'test-provider',
      name: 'Test Provider',
      type: 'openai' as const,
      baseUrl: 'https://api.test.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    response: { primary: 'gpt-4', providerId: 'test-provider' },
    router: { primary: 'gpt-3.5-turbo', providerId: 'test-provider' },
    memory: { primary: 'gpt-4o-mini', providerId: 'test-provider' },
    utility: { primary: 'gpt-3.5-turbo', providerId: 'test-provider' },
    aggregation: { primary: 'gpt-4', providerId: 'test-provider' },
    embedding: { primary: 'text-embedding-3-small', providerId: 'test-provider' },
  },
  services: {
    memory: { embeddingModel: 'nomic-embed-text', indexName: 'bernard', keyPrefix: 'bernard:' },
    search: {},
    weather: { provider: 'open-meteo' },
    geocoding: {},
    infrastructure: { redisUrl: 'redis://localhost:6379' },
  },
  oauth: {
    default: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
    google: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
    github: { authUrl: '', tokenUrl: '', userInfoUrl: '', redirectUri: '', scope: '', clientId: '' },
  },
  backups: { debounceSeconds: 60, directory: '/tmp', retentionDays: 14, retentionCount: 20 },
  limits: { currentRequestMaxTokens: 8000, responseMaxTokens: 8000, allowSignups: true },
  automations: {},
});

// =============================================================================
// Mock Config Factory
// =============================================================================

/**
 * Creates a new mock configuration object with fresh instances.
 * Call this in beforeEach to ensure test isolation and prevent state leakage.
 * 
 * @example
 * ```typescript
 * beforeEach(() => {
 *   const mocks = createMockConfig();
 *   // Use mocks.redis.connected, mocks.queue.empty, etc.
 * });
 * ```
 */
export function createMockConfig() {
  return {
    redis: {
      connected: createConnectedRedisMock(),
      disconnected: createMockRedisClient(),
    },
    queue: {
      empty: createMockQueue('empty-queue'),
      withJobs: createMockQueue('jobs-queue'),
    },
    worker: createMockWorker(),
    queueEvents: createMockQueueEvents(),
    haWebSocket: {
      connected: createConnectedHAWebSocket(),
      disconnected: createMockHAWebSocket(),
    },
    plexClient: createMockPlexClient(),
    overseerrClient: createMockOverseerrClient(),
    childProcess: createMockChildProcess(),
    logger: createMockLogger(),
  };
}

/**
 * @deprecated Use createMockConfig() instead to prevent test state leakage.
 * This export is kept for backward compatibility but creates shared instances.
 */
export const mockConfig = createMockConfig();
