import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TaskRecordKeeper, TaskStatus } from './taskKeeper'

// Create a mock Redis client
function createMockRedis() {
  const storage = new Map<string, string>()
  const hashStorage = new Map<string, Record<string, string>>()
  const listStorage = new Map<string, string[]>()
  const sortedSetStorage = new Map<string, Array<{ score: number; member: string }>>()

  const mockRedis = {
    get: vi.fn(async (key: string) => storage.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
      return 'OK'
    }),
    hgetall: vi.fn(async (key: string) => {
      const data = hashStorage.get(key)
      return data ?? ({} as Record<string, string>)
    }),
    hset: vi.fn(async (key: string, field: string, value: string) => {
      if (!hashStorage.has(key)) {
        hashStorage.set(key, {})
      }
      hashStorage.get(key)![field] = value
      return 1
    }),
    del: vi.fn(async (key: string) => {
      const deleted = storage.has(key) || hashStorage.has(key) || listStorage.has(key)
      storage.delete(key)
      hashStorage.delete(key)
      listStorage.delete(key)
      return deleted ? 1 : 0
    }),
    lrange: vi.fn(async (key: string, start: number, end: number) => {
      const list = listStorage.get(key) ?? []
      if (end === -1) {
        return list.slice(start)
      }
      return list.slice(start, end + 1)
    }),
    zrevrange: vi.fn(async (key: string, start: number, end: number, _withScores?: string) => {
      const set = sortedSetStorage.get(key) ?? []
      // Sort by score descending (revrange)
      const sorted = set.sort((a, b) => b.score - a.score)
      const slice = sorted.slice(start, end === -1 ? undefined : end + 1)
      return slice.flatMap(item => [item.member, String(item.score)])
    }),
    zrem: vi.fn(async (key: string, member: string) => {
      const set = sortedSetStorage.get(key)
      if (!set) return 0
      const idx = set.findIndex(item => item.member === member)
      if (idx === -1) return 0
      set.splice(idx, 1)
      return 1
    }),
    zadd: vi.fn(async (key: string, score: number, member: string) => {
      if (!sortedSetStorage.has(key)) {
        sortedSetStorage.set(key, [])
      }
      const set = sortedSetStorage.get(key)!
      const existing = set.findIndex(item => item.member === member)
      if (existing >= 0) {
        set[existing].score = score
      } else {
        set.push({ score, member })
      }
      return 1
    }),
    zcard: vi.fn(async (key: string) => {
      const set = sortedSetStorage.get(key) ?? []
      return set.length
    }),
    multi: vi.fn(() => {
      const commands: Array<() => Promise<void>> = []
      const multi = {
        hset: vi.fn(function(this: any, ...args: unknown[]) {
          commands.push(async () => {
            const [key, ...rest] = args as [string, ...unknown[]]
            if (typeof rest[0] === 'object') {
              const data = rest[0] as Record<string, string>
              hashStorage.set(key, { ...hashStorage.get(key), ...data })
            }
          })
          return multi
        }),
        del: vi.fn(function(this: any, key: string) {
          commands.push(async () => {
            storage.delete(key)
            hashStorage.delete(key)
          })
          return multi
        }),
        zrem: vi.fn(function(this: any, key: string, member: string) {
          commands.push(async () => {
            const set = sortedSetStorage.get(key)
            if (set) {
              const idx = set.findIndex(item => item.member === member)
              if (idx >= 0) set.splice(idx, 1)
            }
          })
          return multi
        }),
        zadd: vi.fn(function(this: any, key: string, score: number, member: string) {
          commands.push(async () => {
            if (!sortedSetStorage.has(key)) {
              sortedSetStorage.set(key, [])
            }
            const set = sortedSetStorage.get(key)!
            const existing = set.findIndex(item => item.member === member)
            if (existing >= 0) {
              set[existing].score = score
            } else {
              set.push({ score, member })
            }
          })
          return multi
        }),
        exec: vi.fn(async () => {
          for (const cmd of commands) {
            await cmd()
          }
          return commands.map(() => null)
        }),
      }
      return multi
    }),
  }

  return { mockRedis, storage, hashStorage, listStorage, sortedSetStorage }
}

describe('TaskRecordKeeper', () => {
  let keeper: TaskRecordKeeper
  let mock: ReturnType<typeof createMockRedis>

  beforeEach(() => {
    mock = createMockRedis()
    keeper = new TaskRecordKeeper(mock.mockRedis as any, { namespace: 'test:task' })
  })

  describe('getTask', () => {
    it('should return null for non-existent task', async () => {
      const result = await keeper.getTask('nonexistent')
      expect(result).toBeNull()
    })

    it('should return task when exists', async () => {
      const taskId = 'task-123'
      const now = new Date().toISOString()

      // Set up task data in mock
      mock.hashStorage.set('test:task:task:task-123', {
        id: taskId,
        name: 'Test Task',
        status: 'queued',
        toolName: 'test-tool',
        userId: 'user-1',
        createdAt: now,
        messageCount: '0',
        toolCallCount: '0',
        tokensIn: '0',
        tokensOut: '0',
        archived: 'false',
      })

      const result = await keeper.getTask(taskId)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(taskId)
      expect(result!.name).toBe('Test Task')
      expect(result!.status).toBe('queued')
    })

    it('should parse optional fields correctly', async () => {
      const taskId = 'task-456'
      const now = new Date().toISOString()

      mock.hashStorage.set('test:task:task:task-456', {
        id: taskId,
        name: 'Test Task',
        status: 'completed',
        toolName: 'test-tool',
        userId: 'user-1',
        createdAt: now,
        startedAt: now,
        completedAt: now,
        runtimeMs: '5000',
        messageCount: '10',
        toolCallCount: '5',
        tokensIn: '1000',
        tokensOut: '2000',
        archived: 'true',
        archivedAt: now,
      })

      const result = await keeper.getTask(taskId)

      expect(result).not.toBeNull()
      expect(result!.status).toBe('completed')
      expect(result!.startedAt).toBe(now)
      expect(result!.completedAt).toBe(now)
      expect(result!.runtimeMs).toBe(5000)
      expect(result!.archived).toBe(true)
    })
  })

  describe('cancelTask', () => {
    it('should return false for non-existent task', async () => {
      const result = await keeper.cancelTask('nonexistent')
      expect(result).toBe(false)
    })

    it('should return false for already completed task', async () => {
      const taskId = 'task-completed'
      const now = new Date().toISOString()

      mock.hashStorage.set('test:task:task:task-completed', {
        id: taskId,
        name: 'Completed Task',
        status: 'completed',
        toolName: 'test-tool',
        userId: 'user-1',
        createdAt: now,
        messageCount: '0',
        toolCallCount: '0',
        tokensIn: '0',
        tokensOut: '0',
        archived: 'false',
      })

      const result = await keeper.cancelTask(taskId)
      expect(result).toBe(false)
    })

    it('should cancel queued task', async () => {
      const taskId = 'task-to-cancel'
      const now = new Date().toISOString()

      mock.hashStorage.set('test:task:task:task-to-cancel', {
        id: taskId,
        name: 'Task to Cancel',
        status: 'queued',
        toolName: 'test-tool',
        userId: 'user-1',
        createdAt: now,
        messageCount: '0',
        toolCallCount: '0',
        tokensIn: '0',
        tokensOut: '0',
        archived: 'false',
      })

      // Set up sorted sets for the task
      mock.sortedSetStorage.set('test:task:tasks:active', [
        { score: Date.now(), member: taskId },
      ])
      mock.sortedSetStorage.set('test:task:tasks:user:active', [
        { score: Date.now(), member: `user-1:${taskId}` },
      ])

      const result = await keeper.cancelTask(taskId)

      expect(result).toBe(true)

      // Verify task status was updated
      const task = await keeper.getTask(taskId)
      expect(task!.status).toBe('cancelled')
      expect(task!.completedAt).toBeDefined()
    })
  })

  describe('deleteTask', () => {
    it('should return false for non-existent task', async () => {
      const result = await keeper.deleteTask('nonexistent')
      expect(result).toBe(false)
    })

    it('should delete active task', async () => {
      const taskId = 'task-to-delete'
      const now = new Date().toISOString()

      mock.hashStorage.set('test:task:task:task-to-delete', {
        id: taskId,
        name: 'Task to Delete',
        status: 'completed',
        toolName: 'test-tool',
        userId: 'user-1',
        createdAt: now,
        messageCount: '0',
        toolCallCount: '0',
        tokensIn: '0',
        tokensOut: '0',
        archived: 'false',
      })

      mock.sortedSetStorage.set('test:task:tasks:completed', [
        { score: Date.now(), member: taskId },
      ])
      mock.sortedSetStorage.set('test:task:tasks:user:completed', [
        { score: Date.now(), member: `user-1:${taskId}` },
      ])

      const result = await keeper.deleteTask(taskId)

      expect(result).toBe(true)

      // Verify task was deleted
      const task = await keeper.getTask(taskId)
      expect(task).toBeNull()
    })
  })

  describe('listTasks', () => {
    it('should return empty list for user with no tasks', async () => {
      const result = await keeper.listTasks({ userId: 'user-no-tasks' })
      expect(result.tasks).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.hasMore).toBe(false)
    })

    it('should return tasks for user', async () => {
      const now = Date.now()

      // Set up tasks in sorted sets
      mock.sortedSetStorage.set('test:task:tasks:user:active', [
        { score: now, member: 'user-1:task-1' },
        { score: now, member: 'user-1:task-2' },
      ])

      // Add task data
      for (const taskId of ['task-1', 'task-2']) {
        mock.hashStorage.set(`test:task:task:${taskId}`, {
          id: taskId,
          name: `Task ${taskId}`,
          status: 'queued',
          toolName: 'test-tool',
          userId: 'user-1',
          createdAt: new Date().toISOString(),
          messageCount: '0',
          toolCallCount: '0',
          tokensIn: '0',
          tokensOut: '0',
          archived: 'false',
        })
      }

      const result = await keeper.listTasks({ userId: 'user-1' })

      expect(result.tasks).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.hasMore).toBe(false)
    })

    it('should return tasks with pagination info', async () => {
      // This test verifies the listTasks method returns correct structure
      const result = await keeper.listTasks({ userId: 'user-no-tasks' })
      
      // Should return empty array for user with no tasks
      expect(result.tasks).toEqual([])
      expect(result.total).toBe(0)
      expect(result.hasMore).toBe(false)
    })

    it('should return hasMore true when more results than page size', async () => {
      const userId = 'user-many-tasks'
      const totalTasks = 60 // More than default page size of 50
      const pageSize = 50
      const now = Date.now()

      // Create tasks in sorted sets
      const taskMembers = Array.from({ length: totalTasks }, (_, i) => ({
        score: now + i,
        member: `${userId}:task-${i + 1}`
      }))

      mock.sortedSetStorage.set('test:task:tasks:user:active', taskMembers)

      // Add task data for all tasks
      for (let i = 1; i <= totalTasks; i++) {
        const taskId = `task-${i}`
        mock.hashStorage.set(`test:task:task:${taskId}`, {
          id: taskId,
          name: `Task ${i}`,
          status: 'queued',
          toolName: 'test-tool',
          userId: userId,
          createdAt: new Date().toISOString(),
          messageCount: '0',
          toolCallCount: '0',
          tokensIn: '0',
          tokensOut: '0',
          archived: 'false',
        })
      }

      const result = await keeper.listTasks({ userId: userId, limit: pageSize })

      expect(result.tasks).toHaveLength(pageSize)
      expect(result.total).toBe(totalTasks)
      expect(result.hasMore).toBe(true)
    })
  })

  describe('TaskStatus type', () => {
    it('should accept valid status values', () => {
      const validStatuses: TaskStatus[] = [
        'queued',
        'running',
        'completed',
        'errored',
        'uncompleted',
        'cancelled',
      ]

      for (const status of validStatuses) {
        expect(status).toBeDefined()
      }
    })
  })
})
