import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as queue from '../../../../../lib/infra/queue'
import { handleAutoRename } from '@/lib/api/thread-auto-rename'

// Spy on the queue module
const addUtilityJob = vi.spyOn(queue, 'addUtilityJob')

describe('POST /api/threads/[threadId]/auto-rename', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addUtilityJob.mockResolvedValue('job-123')
  })

  describe('handleAutoRename', () => {
    it('should queue auto-rename with firstMessage', async () => {
      const result = await handleAutoRename('thread-123', { firstMessage: 'Hello, help me with coding' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.threadId).toBe('thread-123')
      expect(addUtilityJob).toHaveBeenCalledWith(
        'thread-naming',
        { threadId: 'thread-123', message: 'Hello, help me with coding' },
        expect.objectContaining({
          jobId: 'thread-naming-thread-123',
          deduplicationId: 'thread-naming-thread-123',
        })
      )
    })

    it('should extract first human message from messages array', async () => {
      const messages = [
        { type: 'human', content: 'First human message' },
        { type: 'ai', content: 'AI response' },
      ]

      const result = await handleAutoRename('thread-456', { messages })

      expect(result.status).toBe(200)
      expect(addUtilityJob).toHaveBeenCalledWith(
        'thread-naming',
        { threadId: 'thread-456', message: 'First human message' },
        expect.any(Object)
      )
    })

    it('should return 400 when firstMessage and messages are missing', async () => {
      const result = await handleAutoRename('thread-789', {})

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain('firstMessage or messages is required')
    })

    it('should return 400 when no human message in messages', async () => {
      const messages = [
        { type: 'ai', content: 'AI response only' },
      ]

      const result = await handleAutoRename('thread-999', { messages })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain('Could not extract first human message')
    })

    it('should handle non-string message content', async () => {
      const messages = [
        { type: 'human', content: { text: 'Complex message' } },
      ]

      const result = await handleAutoRename('thread-complex', { messages })

      expect(result.status).toBe(200)
      expect(addUtilityJob).toHaveBeenCalled()
      const callArgs = (addUtilityJob.mock.calls[0][1] as any).message
      expect(callArgs).toBe('{"text":"Complex message"}')
    })

    it('should return 500 when addUtilityJob fails', async () => {
      addUtilityJob.mockRejectedValue(new Error('Queue error'))

      const result = await handleAutoRename('thread-error', { firstMessage: 'Test' })

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.error).toBe('Failed to queue auto-rename')
    })
  })
})
