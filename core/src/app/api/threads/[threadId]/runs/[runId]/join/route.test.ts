import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('GET /api/threads/[threadId]/runs/[runId]/join', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const params = Promise.resolve({ threadId: 'thread-123', runId: 'run-456' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads/thread-123/runs/run-456/join'
    )
  })
})
