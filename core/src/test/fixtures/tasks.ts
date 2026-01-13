import type { TaskRecord } from '@/lib/infra/taskKeeper'

export function mockTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-123',
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    userId: 'user-123',
    title: 'Test Task',
    ...overrides,
  }
}

export function mockTaskEvent(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'event-456',
    taskId: 'task-123',
    timestamp: Date.now(),
    type: 'status_update',
    data: { status: 'running' },
    ...overrides,
  }
}
