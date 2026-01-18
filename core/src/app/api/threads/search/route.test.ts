import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

// Hoisted mocks - must be before imports
const { mockGetSession } = vi.hoisted(() => {
  return {
    mockGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  }
})

vi.mock('@/lib/auth/server-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/server-helpers')>('@/lib/auth/server-helpers');
  return {
    ...actual,
    getSession: vi.fn().mockImplementation(() => mockGetSession()),
  };
});

describe('POST /api/threads/search', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('should proxy search request to LangGraph', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } })

    // Stub global fetch to mock the LangGraph response
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = {
      json: async () => ({ query: 'search term' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(200)
  })

  it('should handle empty search results', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } })

    // Stub global fetch to mock the LangGraph response
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = {
      json: async () => ({ query: '' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(200)
  })
})
