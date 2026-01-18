import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, DELETE, PATCH } from './route'

// Hoisted mocks - must be before imports
const { mockGetSession, mockProxyToLangGraph, mockGetLangGraphUrl } = vi.hoisted(() => {
  return {
    mockGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
    mockProxyToLangGraph: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    mockGetLangGraphUrl: vi.fn((path: string) => `http://langgraph:2024${path}`),
  }
})

vi.mock('@/lib/langgraph/proxy', async () => {
  const actual = await vi.importActual<typeof import('@/lib/langgraph/proxy')>('@/lib/langgraph/proxy');
  return {
    ...actual,
    proxyToLangGraph: vi.fn().mockImplementation((...args: unknown[]) => mockProxyToLangGraph(...args)),
    getLangGraphUrl: vi.fn((path: string) => mockGetLangGraphUrl(path)),
  };
});

vi.mock('@/lib/auth/server-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/server-helpers')>('@/lib/auth/server-helpers');
  return {
    ...actual,
    getSession: vi.fn().mockImplementation(() => mockGetSession()),
  };
});

// Mock global fetch
const createFetchMock = (response: any) => {
  return vi.fn().mockResolvedValue(response)
}

describe('GET /api/threads/[threadId]', () => {
  beforeEach(() => {
    // Reset mocks to default values between tests
    mockGetSession.mockReset()
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } })
    mockProxyToLangGraph.mockReset()
    mockProxyToLangGraph.mockResolvedValue(new Response('{}', { status: 200 }))
    mockGetLangGraphUrl.mockReset()
    mockGetLangGraphUrl.mockImplementation((path: string) => `http://langgraph:2024${path}`)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return 401 for unauthenticated request', async () => {
    mockGetSession.mockResolvedValue(null)

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(401)
  })

  it('should return 403 for non-owner', async () => {
    vi.stubGlobal('fetch', createFetchMock({
      ok: true,
      json: async () => ({ user_id: 'user-456' }),
    }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(403)
  })

  it('should return thread for owner', async () => {
    vi.stubGlobal('fetch', createFetchMock({
      ok: true,
      json: async () => ({ user_id: 'user-123', values: {} }),
    }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
  })

  it('should check metadata.user_id for ownership', async () => {
    vi.stubGlobal('fetch', createFetchMock({
      ok: true,
      json: async () => ({ metadata: { user_id: 'user-123' }, values: {} }),
    }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
  })
})

describe('DELETE /api/threads/[threadId]', () => {
  beforeEach(() => {
    // Reset mocks to default values between tests
    mockGetSession.mockReset()
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } })
    mockProxyToLangGraph.mockReset()
    mockProxyToLangGraph.mockResolvedValue(new Response(null, { status: 204 }))
    mockGetLangGraphUrl.mockReset()
    mockGetLangGraphUrl.mockImplementation((path: string) => `http://langgraph:2024${path}`)
    vi.stubGlobal('fetch', createFetchMock({
      ok: true,
      json: async () => ({ user_id: 'user-123' }),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockGetSession.mockReset()
    mockProxyToLangGraph.mockReset()
    mockGetLangGraphUrl.mockReset()
  })

  it('should return 401 for unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })

    expect(response.status).toBe(401)
  })

  it('should return 403 for non-owner', async () => {
    vi.stubGlobal('fetch', createFetchMock({
      ok: true,
      json: async () => ({ user_id: 'user-456' }),
    }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })

    expect(response.status).toBe(403)
  })

  it('should delete thread for owner', async () => {
    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })

    expect(response.status).toBe(204)
    expect(mockProxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads/thread-123',
      { method: 'DELETE' }
    )
  })
})

describe('PATCH /api/threads/[threadId]', () => {
  beforeEach(() => {
    // Reset mocks to default values between tests
    mockGetSession.mockReset()
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } })
    mockProxyToLangGraph.mockReset()
    mockProxyToLangGraph.mockResolvedValue(new Response('{}', { status: 200 }))
    mockGetLangGraphUrl.mockReset()
    mockGetLangGraphUrl.mockImplementation((path: string) => `http://langgraph:2024${path}`)
    vi.stubGlobal('fetch', createFetchMock({
      ok: true,
      json: async () => ({ user_id: 'user-123' }),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockGetSession.mockReset()
    mockProxyToLangGraph.mockReset()
    mockGetLangGraphUrl.mockReset()
  })

  it('should return 401 for unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await PATCH(request, { params })

    expect(response.status).toBe(401)
  })

  it('should return 403 for non-owner', async () => {
    vi.stubGlobal('fetch', createFetchMock({
      ok: true,
      json: async () => ({ user_id: 'user-456' }),
    }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {} as import('next/server').NextRequest
    const response = await PATCH(request, { params })

    expect(response.status).toBe(403)
  })

  it('should rename thread for owner', async () => {
    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {
      json: async () => ({ name: 'New Name' }),
    } as unknown as import('next/server').NextRequest
    const response = await PATCH(request, { params })

    expect(response.status).toBe(200)
  })
})
