import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, PUT } from './route'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('GET /api/threads/[threadId]/state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {
      url: 'http://localhost:3456/api/threads/thread-123/state',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads/thread-123/state'
    )
  })
})

describe('PUT /api/threads/[threadId]/state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy state update to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {
      url: 'http://localhost:3456/api/threads/thread-123/state',
      json: async () => ({ values: { messages: [] } }),
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request, { params })

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalled()
    // The third argument is the options object, check it contains PUT method
    const callArgs = (proxyToLangGraph as any).mock.calls[0]
    expect(callArgs[2]).toHaveProperty('method', 'PUT')
  })
})
