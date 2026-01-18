import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('POST /api/threads/[threadId]/runs/[runId]/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy streaming request to LangGraph', async () => {
    const mockStream = new ReadableStream()
    ;(proxyToLangGraph as any).mockResolvedValue(mockStream)

    const params = Promise.resolve({ threadId: 'thread-123', runId: 'run-456' })
    const request = {
      url: 'http://localhost:3456/api/threads/thread-123/runs/run-456/stream',
      json: async () => ({ input: { messages: [] } }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request, { params })

    expect(response).toBeDefined()
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      request,
      '/threads/thread-123/runs/run-456/stream',
      { streaming: true }
    )
  })
})
