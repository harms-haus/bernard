import type { Task } from '@/lib/infra/taskKeeper'

export function mockTaskRecord(overrides: Record<string, any> = {}): Task {
  return {
    id: 'task-123',
    status: 'running',
    createdAt: new Date().toISOString(),
    userId: 'user-123',
    name: 'Test Task',
    toolName: 'test-tool',
    messageCount: 0,
    toolCallCount: 0,
    tokensIn: 0,
    tokensOut: 0,
    archived: false,
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
