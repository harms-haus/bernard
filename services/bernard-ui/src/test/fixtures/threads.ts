export function mockThread(overrides: Partial<ThreadData> = {}): ThreadData {
  const base: ThreadData = {
    id: 'thread-123',
    title: 'Test Thread',
    messages: [],
    branches: [],
    currentBranch: 'main',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  return { ...base, ...overrides }
}

export function mockMessage(overrides: Partial<MessageData> = {}): MessageData {
  const base: MessageData = {
    id: 'msg-123',
    role: 'user',
    content: 'Hello, world!',
    createdAt: new Date(),
  }

  return { ...base, ...overrides }
}

export function mockBranch(overrides: Partial<BranchData> = {}): BranchData {
  const base: BranchData = {
    id: 'branch-123',
    name: 'alternative-branch',
    parentId: 'msg-123',
    messages: [],
  }

  return { ...base, ...overrides }
}

interface ThreadData {
  id: string
  title: string
  messages: MessageData[]
  branches: BranchData[]
  currentBranch: string
  createdAt: Date
  updatedAt: Date
}

interface MessageData {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCallData[]
  createdAt: Date
}

interface BranchData {
  id: string
  name: string
  parentId: string
  messages: MessageData[]
}

interface ToolCallData {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
}
