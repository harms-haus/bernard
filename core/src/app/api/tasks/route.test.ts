import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import * as helpers from '../../../lib/auth/helpers'
import * as factory from '../../../lib/api/factory'
import { handleGetTasks, handlePostTaskAction, handleDeleteTask } from './route'

// Spy on the helpers and factory modules
const requireAuth = vi.spyOn(helpers, 'requireAuth')
const getTaskKeeper = vi.spyOn(factory, 'getTaskKeeper')

describe('GET /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue({ user: { id: 'user-123' } } as any)
  })

  describe('handleGetTasks', () => {
    it('should return task list for authenticated user', async () => {
      const mockResult = {
        tasks: [
          { id: 'task-1', name: 'Test Task', status: 'completed', userId: 'user-123' },
        ],
        total: 1,
        hasMore: false,
      }

      const mockKeeper = {
        listTasks: vi.fn().mockResolvedValue(mockResult),
      }
      getTaskKeeper.mockReturnValue(mockKeeper as any)

      const request = {
        nextUrl: {
          searchParams: new URLSearchParams(),
        },
      } as unknown as import('next/server').NextRequest

      const result = await handleGetTasks(request)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.items).toHaveLength(1)
      expect(data.data.total).toBe(1)
    })

    it('should return 401 when not authenticated', async () => {
      requireAuth.mockResolvedValue(new NextResponse('Unauthorized', { status: 401 }))

      const request = {
        nextUrl: { searchParams: new URLSearchParams() },
      } as unknown as import('next/server').NextRequest

      const result = await handleGetTasks(request)

      expect(result.status).toBe(401)
    })

    it('should parse pagination params', async () => {
      const mockKeeper = {
        listTasks: vi.fn().mockResolvedValue({ tasks: [], total: 0, hasMore: false }),
      }
      getTaskKeeper.mockReturnValue(mockKeeper as any)

      const request = {
        nextUrl: {
          searchParams: new URLSearchParams('limit=10&offset=20'),
        },
      } as unknown as import('next/server').NextRequest

      await handleGetTasks(request)

      expect(mockKeeper.listTasks).toHaveBeenCalledWith({
        userId: 'user-123',
        includeArchived: false,
        limit: 10,
        offset: 20,
      })
    })
  })

  describe('handlePostTaskAction', () => {
    it('should cancel task', async () => {
      const mockKeeper = {
        getTask: vi.fn().mockResolvedValue({ id: 'task-1', userId: 'user-123' }),
        cancelTask: vi.fn().mockResolvedValue(true),
      }
      getTaskKeeper.mockReturnValue(mockKeeper as any)

      const result = await handlePostTaskAction({} as any, { action: 'cancel', taskId: 'task-1' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
    })

    it('should return 400 when taskId missing', async () => {
      const result = await handlePostTaskAction({} as any, { action: 'cancel' })

      expect(result.status).toBe(400)
    })

    it('should return 404 when task not found', async () => {
      const mockKeeper = {
        getTask: vi.fn().mockResolvedValue(null),
      }
      getTaskKeeper.mockReturnValue(mockKeeper as any)

      const result = await handlePostTaskAction({} as any, { action: 'cancel', taskId: 'unknown' })

      expect(result.status).toBe(404)
    })

    it('should return 403 when user does not own task', async () => {
      const mockKeeper = {
        getTask: vi.fn().mockResolvedValue({ id: 'task-1', userId: 'other-user' }),
      }
      getTaskKeeper.mockReturnValue(mockKeeper as any)

      const result = await handlePostTaskAction({} as any, { action: 'cancel', taskId: 'task-1' })

      expect(result.status).toBe(403)
    })
  })

  describe('handleDeleteTask', () => {
    it('should delete task', async () => {
      const mockKeeper = {
        getTask: vi.fn().mockResolvedValue({ id: 'task-1', userId: 'user-123' }),
        deleteTask: vi.fn().mockResolvedValue(true),
      }
      getTaskKeeper.mockReturnValue(mockKeeper as any)

      const result = await handleDeleteTask({} as any, new URLSearchParams('taskId=task-1'))

      expect(result.status).toBe(200)
    })

    it('should return 400 when taskId missing', async () => {
      const result = await handleDeleteTask({} as any, new URLSearchParams())

      expect(result.status).toBe(400)
    })
  })
})
