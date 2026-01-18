import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, OPTIONS } from './route'
import * as langgraph from '@langchain/langgraph-sdk'
import * as fs from 'fs'

// Create a mock for readFileSync
const mockReadFileSync = vi.fn()

// Mock fs module - must be hoisted
vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
}))

// Mock @langchain/langgraph-sdk - must be hoisted
vi.mock('@langchain/langgraph-sdk', () => ({
  Client: vi.fn(),
}))

describe('GET /api/v1/models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('OPTIONS', () => {
    it('should return 204 with CORS headers', async () => {
      const response = await OPTIONS()
      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    })
  })

  describe('GET', () => {
    it('should return models from LangGraph server', async () => {
      const mockAssistants = [
        { graph_id: 'bernard_agent' },
        { graph_id: 'another_agent' },
      ]

      // Get the mocked Client constructor and instance
      const { Client } = langgraph
      const mockClientInstance = {
        assistants: {
          search: vi.fn().mockResolvedValue(mockAssistants),
        },
      }
      ;(Client as any).mockImplementation(() => mockClientInstance)

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.object).toBe('list')
      expect(data.data).toHaveLength(2)
      expect(data.data[0].id).toBe('bernard_agent')
    })

    it('should fallback to langgraph.json when LangGraph server unavailable', async () => {
      const { Client } = langgraph
      const mockClientInstance = {
        assistants: {
          search: vi.fn().mockRejectedValue(new Error('Connection failed')),
        },
      }
      ;(Client as any).mockImplementation(() => mockClientInstance)

      // Set up the fs mock
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          graphs: {
            'agent_1': {},
            'agent_2': {},
          },
        })
      )

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.data).toHaveLength(3)
    })

    it('should always include bernard_agent', async () => {
      const { Client } = langgraph
      const mockClientInstance = {
        assistants: {
          search: vi.fn().mockResolvedValue([]),
        },
      }
      ;(Client as any).mockImplementation(() => mockClientInstance)

      mockReadFileSync.mockReturnValue(JSON.stringify({ graphs: {} }))

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.data[0].id).toBe('bernard_agent')
    })

    it('should return bernard_agent as fallback when both LangGraph and config unavailable', async () => {
      const { Client } = langgraph
      const mockClientInstance = {
        assistants: {
          search: vi.fn().mockRejectedValue(new Error('Failed')),
        },
      }
      ;(Client as any).mockImplementation(() => mockClientInstance)

      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found')
      })

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.data).toHaveLength(1)
      expect(data.data[0].id).toBe('bernard_agent')
    })

    it('should include correct model object structure', async () => {
      const { Client } = langgraph
      const mockClientInstance = {
        assistants: {
          search: vi.fn().mockResolvedValue([{ graph_id: 'test_agent' }]),
        },
      }
      ;(Client as any).mockImplementation(() => mockClientInstance)

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      const model = data.data[0]

      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('object', 'model')
      expect(model).toHaveProperty('created')
      expect(model).toHaveProperty('owned_by', 'bernard')
    })

    it('should handle LangGraph error gracefully', async () => {
      const { Client } = langgraph
      const mockClientInstance = {
        assistants: {
          search: vi.fn().mockRejectedValue(new Error('Server error')),
        },
      }
      ;(Client as any).mockImplementation(() => mockClientInstance)

      mockReadFileSync.mockReturnValue(JSON.stringify({ graphs: {} }))

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)
      expect(response.status).toBe(200)
    })
  })
})
