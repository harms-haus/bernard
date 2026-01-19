import type { User } from '@/types/auth';
import type { ThreadListItem } from '@/services/api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
}

export interface ThreadListResponse {
  threads: ThreadListItem[];
  total: number;
  hasMore: boolean;
}

export interface ThreadDetail {
  id: string;
  checkpoints: Array<{ id: string; timestamp: string }>;
  checkpointCount: number;
}

export interface AutoRenameResponse {
  success: boolean;
  threadId: string;
  name: string;
}

export interface UpdateThreadResponse {
  id: string;
  name: string;
  updated: boolean;
}

export interface DeleteThreadResponse {
  id: string;
  deleted: boolean;
}

export interface CreateThreadResponse {
  thread_id: string;
}

export interface TasksListResponse {
  tasks: Array<{
    id: string;
    name: string;
    status: string;
    toolName: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    runtimeMs?: number;
    errorMessage?: string;
    messageCount: number;
    toolCallCount: number;
    tokensIn: number;
    tokensOut: number;
    archived: boolean;
  }>;
  total: number;
  hasMore: boolean;
}

export interface TaskDetail {
  task: Record<string, unknown>;
  events: Array<{
    type: string;
    timestamp: string;
    data: Record<string, unknown>;
  }>;
  sections: Record<string, {
    name: string;
    description: string;
    content: string;
  }>;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }>;
}

export interface IAPIClient {
  // Auth
  login(credentials: LoginCredentials): Promise<LoginResponse>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  githubLogin(): Promise<void>;
  googleLogin(): Promise<void>;
  updateProfile(data: UpdateProfileRequest): Promise<User>;
  
  // Threads
  listThreads(limit?: number): Promise<ThreadListResponse>;
  getThread(threadId: string): Promise<ThreadDetail>;
  getThreadState(threadId: string): Promise<Record<string, unknown>>;
  createThread(): Promise<CreateThreadResponse>;
  updateThread(threadId: string, name: string): Promise<UpdateThreadResponse>;
  deleteThread(threadId: string): Promise<DeleteThreadResponse>;
  autoRenameThread(
    threadId: string,
    firstMessage?: string,
    messages?: Array<{ type: string; content: unknown }>
  ): Promise<AutoRenameResponse>;
  
  // Users
  listUsers(): Promise<User[]>;
  createUser(userData: { id: string; displayName: string; isAdmin: boolean }): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<User>;
  
  // Tasks
  getTasks(includeArchived?: boolean, limit?: number, offset?: number): Promise<TasksListResponse>;
  getTask(taskId: string): Promise<TaskDetail>;
}
