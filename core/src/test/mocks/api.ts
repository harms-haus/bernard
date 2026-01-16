import { vi } from 'vitest';

interface MockAPIClientType {
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  getCurrentUser: ReturnType<typeof vi.fn>;
  githubLogin: ReturnType<typeof vi.fn>;
  googleLogin: ReturnType<typeof vi.fn>;
  updateProfile: ReturnType<typeof vi.fn>;
  listThreads: ReturnType<typeof vi.fn>;
  getThread: ReturnType<typeof vi.fn>;
  createThread: ReturnType<typeof vi.fn>;
  updateThread: ReturnType<typeof vi.fn>;
  deleteThread: ReturnType<typeof vi.fn>;
  autoRenameThread: ReturnType<typeof vi.fn>;
  listUsers: ReturnType<typeof vi.fn>;
  createUser: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
  getTasks: ReturnType<typeof vi.fn>;
  getTask: ReturnType<typeof vi.fn>;
}

export function createMockAPIClient(overrides: Partial<MockAPIClientType> = {}): MockAPIClientType {
  const mock: MockAPIClientType = {
    login: vi.fn().mockResolvedValue({
      user: {
        id: '1',
        displayName: 'Test User',
        isAdmin: false,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      accessToken: 'mock-token',
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    githubLogin: vi.fn().mockResolvedValue(undefined),
    googleLogin: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({
      id: '1',
      displayName: 'Updated',
      isAdmin: false,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    listThreads: vi.fn().mockResolvedValue({ threads: [], total: 0, hasMore: false }),
    getThread: vi.fn().mockResolvedValue({ id: '1', checkpoints: [], checkpointCount: 0 }),
    createThread: vi.fn().mockResolvedValue({ thread_id: 'new-thread' }),
    updateThread: vi.fn().mockResolvedValue({ id: '1', name: 'Updated', updated: true }),
    deleteThread: vi.fn().mockResolvedValue({ id: '1', deleted: true }),
    autoRenameThread: vi.fn().mockResolvedValue({ success: true, threadId: '1', name: 'New Name' }),
    listUsers: vi.fn().mockResolvedValue([]),
    createUser: vi.fn().mockResolvedValue({
      id: '1',
      displayName: 'New User',
      isAdmin: false,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateUser: vi.fn().mockResolvedValue({
      id: '1',
      displayName: 'Updated',
      isAdmin: false,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    deleteUser: vi.fn().mockResolvedValue({
      id: '1',
      displayName: 'Deleted',
      isAdmin: false,
      status: 'deleted' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getTasks: vi.fn().mockResolvedValue({ tasks: [], total: 0, hasMore: false }),
    getTask: vi.fn().mockResolvedValue({ task: {}, events: [], sections: {}, messages: [] }),
    ...overrides,
  };
  
  return mock;
}

export function mockFetch() {
  const mock = vi.fn() as ReturnType<typeof vi.fn>;
  globalThis.fetch = mock as any;
  return {
    mock,
    mockResolvedResponse<T>(data: T, ok: boolean = true) {
      mock.mockResolvedValue({
        ok,
        status: ok ? 200 : 400,
        json: async () => data,
        body: new ReadableStream(),
      });
    },
    mockRejectedResponse(error: Error | string) {
      const err = typeof error === 'string' ? new Error(error) : error;
      mock.mockRejectedValue(err);
    },
    reset() {
      mock.mockClear();
    },
  };
}
