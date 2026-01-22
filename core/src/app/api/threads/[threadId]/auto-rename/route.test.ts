import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleAutoRename } from '@/lib/api/thread-auto-rename'
import * as queueModule from '../../../../../lib/infra/worker-queue'

// Mock the queue module
vi.mock('../../../../../lib/infra/worker-queue', () => ({
  addJob: vi.fn(),
}))

// Mock the LangGraph SDK
vi.mock('@langchain/langgraph-sdk', () => ({
  Client: vi.fn().mockImplementation(() => ({
    threads: {
      getState: vi.fn(),
    },
  })),
}))

describe('POST /api/threads/[threadId]/auto-rename', () => {
  let addJob: any

  beforeEach(() => {
    vi.clearAllMocks()
    addJob = vi.mocked(queueModule.addJob)
    addJob.mockResolvedValue('job-123')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('handleAutoRename', () => {
    it('should queue auto-rename with messages from body', async () => {
      const messages = [
        { type: 'human', content: 'First human message' },
        { type: 'ai', content: 'AI response' },
      ]

      const result = await handleAutoRename('thread-123', { messages })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.threadId).toBe('thread-123')
      expect(addJob).toHaveBeenCalledWith(
        'thread-naming',
        { threadId: 'thread-123', messages },
        expect.objectContaining({
          jobId: 'thread-naming-thread-123',
          deduplicationId: 'thread-naming-thread-123',
        })
      )
    })

    it('should fetch thread state from LangGraph when no messages provided', async () => {
      const { Client } = await import('@langchain/langgraph-sdk')
      const mockGetState = vi.fn().mockResolvedValue({
        values: {
          messages: [
            { type: 'human', content: 'Fetched message' },
            { type: 'ai', content: 'AI response' },
          ]
        }
      })

      // Clear previous mock and setup new one
      vi.resetModules()
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(() => ({
          threads: { getState: mockGetState },
        })),
      }))

      // Re-import with fresh mocks
      const { handleAutoRename: handleAutoRenameFresh } = await import('@/lib/api/thread-auto-rename')

      const result = await handleAutoRenameFresh('thread-456', {})

      expect(result.status).toBe(200)
      expect(mockGetState).toHaveBeenCalledWith('thread-456')
      expect(addJob).toHaveBeenCalledWith(
        'thread-naming',
        {
          threadId: 'thread-456',
          messages: [
            { type: 'human', content: 'Fetched message' },
            { type: 'ai', content: 'AI response' },
          ]
        },
        expect.any(Object)
      )
    })

    it('should return 400 when thread has no messages', async () => {
      const { Client } = await import('@langchain/langgraph-sdk')
      const mockGetState = vi.fn().mockResolvedValue({
        values: { messages: [] }
      })

      vi.resetModules()
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(() => ({
          threads: { getState: mockGetState },
        })),
      }))

      const { handleAutoRename: handleAutoRenameFresh } = await import('@/lib/api/thread-auto-rename')

      const result = await handleAutoRenameFresh('thread-789', {})

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain('Could not retrieve thread messages')
    })

    it('should return 400 when LangGraph fetch fails', async () => {
      const mockGetState = vi.fn().mockRejectedValue(new Error('Connection refused'))

      vi.resetModules()
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(() => ({
          threads: { getState: mockGetState },
        })),
      }))

      const { handleAutoRename: handleAutoRenameFresh } = await import('@/lib/api/thread-auto-rename')

      const result = await handleAutoRenameFresh('thread-789', {})

      expect(result.status).toBe(400)
    })

    it('should handle non-string message content', async () => {
      const messages = [
        { type: 'human', content: { text: 'Complex message' } },
      ]

      const result = await handleAutoRename('thread-complex', { messages })

      expect(result.status).toBe(200)
      expect(addJob).toHaveBeenCalled()
      const callArgs = addJob.mock.calls[0][1]
      expect(callArgs.messages).toEqual(messages)
    })

    it('should return 500 when addJob fails', async () => {
      addJob.mockRejectedValue(new Error('Queue error'))

      const result = await handleAutoRename('thread-error', {
        messages: [{ type: 'human', content: 'Test' }]
      })

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.error).toBe('Failed to queue auto-rename')
    })
  })
})
