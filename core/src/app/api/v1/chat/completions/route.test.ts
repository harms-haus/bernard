import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Create a constructor function for the mock client with explicit this typing
const MockClient = function MockClient(this: any) {
  this.threads = {
    create: vi.fn(),
  }
  this.runs = {
    create: vi.fn(),
    join: vi.fn(),
    stream: vi.fn(),
  }
}

describe('POST /api/v1/chat/completions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Clear module cache between tests to ensure fresh mocks
    vi.resetModules()
  })

  describe('Validation', () => {
    it('should return 400 for missing messages', async () => {
      // Mock client to prevent actual API calls BEFORE importing route
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockRejectedValue(new Error('should not be called')) }
          this.runs = { create: vi.fn(), join: vi.fn(), stream: vi.fn() }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({}),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('messages is required')
    })

    it('should return 400 for empty messages array', async () => {
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockRejectedValue(new Error('should not be called')) }
          this.runs = { create: vi.fn(), join: vi.fn(), stream: vi.fn() }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({ messages: [] }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('messages is required')
    })

    it('should return 400 for non-array messages', async () => {
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockRejectedValue(new Error('should not be called')) }
          this.runs = { create: vi.fn(), join: vi.fn(), stream: vi.fn() }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({ messages: 'not an array' }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('Thread Creation', () => {
    it('should create new thread when thread_id not provided', async () => {
      const mockThread = { thread_id: 'new-thread-123' }
      const mockRun = { run_id: 'run-123', status: 'success' }
      const mockCreate = vi.fn().mockResolvedValue(mockThread)
      
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: mockCreate }
          this.runs = {
            create: vi.fn().mockResolvedValue(mockRun),
            join: vi.fn().mockResolvedValue(mockRun),
            stream: vi.fn(),
          }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(mockCreate).toHaveBeenCalledOnce()
    })

    it('should use provided thread_id', async () => {
      const mockRun = { run_id: 'run-123', status: 'success' }
      
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn() }
          this.runs = {
            create: vi.fn().mockResolvedValue(mockRun),
            join: vi.fn().mockResolvedValue(mockRun),
            stream: vi.fn(),
          }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
          thread_id: 'existing-thread-456',
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(200)
    })
  })

  describe('Non-Streaming Response', () => {
    it('should return complete response for non-streaming request', async () => {
      const mockRun = {
        run_id: 'run-123',
        status: 'success',
        output: 'Hello, how can I help you?',
      }
      
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockResolvedValue({ thread_id: 'thread-123' }) }
          this.runs = {
            create: vi.fn().mockResolvedValue(mockRun),
            join: vi.fn().mockResolvedValue(mockRun),
            stream: vi.fn(),
          }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.run_id).toBe('run-123')
    })
  })

  describe('Streaming Response', () => {
    it('should set SSE headers for streaming request', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
        }),
      }
      
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockResolvedValue({ thread_id: 'thread-123' }) }
          this.runs = {
            create: vi.fn(),
            join: vi.fn(),
            stream: vi.fn().mockReturnValue(mockStream),
          }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')
      expect(response.headers.get('X-Accel-Buffering')).toBe('no')
    })

    it('should send [DONE] marker at end of stream', async () => {
      let callCount = 0
      const mockStream = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            callCount++
            if (callCount > 2) {
              return { done: true }
            }
            return {
              done: false,
              value: { event: 'done', data: [] }
            }
          },
        }),
      }
      
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockResolvedValue({ thread_id: 'thread-123' }) }
          this.runs = {
            create: vi.fn(),
            join: vi.fn(),
            stream: vi.fn().mockReturnValue(mockStream),
          }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(200)

      // Consume the response body and assert [DONE] marker is present
      const responseText = await response.text()
      expect(responseText).toContain('data: [DONE]')
    })
  })

  describe('Error Handling', () => {
    it('should return 500 on thread creation error', async () => {
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockRejectedValue(new Error('Connection failed')) }
          this.runs = { create: vi.fn(), join: vi.fn(), stream: vi.fn() }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(500)
    })

    it('should return 500 on run creation error', async () => {
      vi.doMock('@langchain/langgraph-sdk', () => ({
        Client: vi.fn().mockImplementation(function(this: any) {
          this.threads = { create: vi.fn().mockResolvedValue({ thread_id: 'thread-123' }) }
          this.runs = {
            create: vi.fn().mockRejectedValue(new Error('Run failed')),
            join: vi.fn(),
            stream: vi.fn(),
          }
        }),
      }))

      const { POST } = await import('./route')

      const request = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(500)
    })
  })
})
