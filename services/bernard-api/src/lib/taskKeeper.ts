import type Redis from "ioredis";

const DEFAULT_NAMESPACE = "bernard:task:rk";

export type TaskStatus = "queued" | "running" | "completed" | "errored" | "uncompleted" | "cancelled";

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  toolName: string;
  userId: string;
  conversationId?: string;
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
  archivedAt?: string;
  sections?: Record<string, string>;
}

export interface TaskEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface TaskListQuery {
  userId: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
}

export interface TaskRecallResult {
  task: Task;
  sections: Record<string, { name: string; description: string; content: string }>;
  messages: Array<{
    id: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    createdAt: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  }>;
}

function nowIso() {
  return new Date().toISOString();
}

export class TaskRecordKeeper {
  private readonly namespace: string;

  constructor(
    private readonly redis: Redis,
    opts: { namespace?: string } = {}
  ) {
    this.namespace = opts.namespace ?? DEFAULT_NAMESPACE;
  }

  private key(suffix: string) {
    return `${this.namespace}:${suffix}`;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const taskKey = this.key(`task:${taskId}`);
    const data = await this.redis.hgetall(taskKey);

    if (!data || !data["id"]) {
      return null;
    }

    let sections: Record<string, string> | undefined;
    if (data["sections"]) {
      try {
        sections = JSON.parse(data["sections"]) as Record<string, string>;
      } catch {
        sections = undefined;
      }
    }

    const task: Task = {
      id: data["id"],
      name: data["name"] || "",
      status: data["status"] as TaskStatus,
      toolName: data["toolName"] || "",
      userId: data["userId"] || "",
      ...(data["conversationId"] && { conversationId: data["conversationId"] }),
      createdAt: data["createdAt"] || "",
      ...(data["startedAt"] && { startedAt: data["startedAt"] }),
      ...(data["completedAt"] && { completedAt: data["completedAt"] }),
      ...(data["runtimeMs"] && { runtimeMs: Number(data["runtimeMs"]) }),
      ...(data["errorMessage"] && { errorMessage: data["errorMessage"] }),
      messageCount: Number(data["messageCount"]) || 0,
      toolCallCount: Number(data["toolCallCount"]) || 0,
      tokensIn: Number(data["tokensIn"]) || 0,
      tokensOut: Number(data["tokensOut"]) || 0,
      archived: data["archived"] === "true",
      ...(data["archivedAt"] && { archivedAt: data["archivedAt"] }),
      ...(sections && { sections })
    };

    return task;
  }

  async getTaskEvents(taskId: string, limit?: number): Promise<TaskEvent[]> {
    const eventsKey = this.key(`task:${taskId}:events`);
    let rawEvents: string[];

    if (limit) {
      rawEvents = await this.redis.lrange(eventsKey, -limit, -1);
    } else {
      rawEvents = await this.redis.lrange(eventsKey, 0, -1);
    }

    return rawEvents.map((eventStr) => {
      try {
        return JSON.parse(eventStr) as TaskEvent;
      } catch {
        return null;
      }
    }).filter((event): event is TaskEvent => event !== null);
  }

  async listTasks(query: TaskListQuery): Promise<TaskListResponse> {
    const { userId, includeArchived = false, limit = 50, offset = 0 } = query;

    const activeKey = this.key("tasks:user:active");
    const completedKey = this.key("tasks:user:completed");
    const archivedKey = this.key("tasks:user:archived");

    const activeTasks = await this.redis.zrevrange(activeKey, offset, offset + limit - 1, "WITHSCORES");
    const completedTasks = await this.redis.zrevrange(completedKey, offset, offset + limit - 1, "WITHSCORES");
    const archivedTasks = includeArchived ? await this.redis.zrevrange(archivedKey, offset, offset + limit - 1, "WITHSCORES") : [];

    const allTasks = [
      ...activeTasks.filter((_, i) => i % 2 === 0 && activeTasks[i]?.startsWith(`${userId}:`)).map((item) => item?.replace(`${userId}:`, "")),
      ...completedTasks.filter((_, i) => i % 2 === 0 && completedTasks[i]?.startsWith(`${userId}:`)).map((item) => item?.replace(`${userId}:`, "")),
      ...(includeArchived ? archivedTasks.filter((_, i) => i % 2 === 0 && archivedTasks[i]?.startsWith(`${userId}:`)).map((item) => item?.replace(`${userId}:`, "")) : [])
    ];

    const tasks = await Promise.all(
      allTasks.slice(0, limit).map((taskId) => this.getTask(taskId))
    );

    const validTasks = tasks.filter((task): task is Task => task !== null);

    return {
      tasks: validTasks,
      total: allTasks.length,
      hasMore: allTasks.length > limit
    };
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task || task.status === "completed" || task.status === "errored" || task.status === "cancelled") {
      return false;
    }

    const taskKey = this.key(`task:${taskId}`);
    const now = nowIso();

    const multi = this.redis.multi();
    multi.hset(taskKey, {
      status: "cancelled",
      completedAt: now
    });

    multi.zrem(this.key("tasks:active"), taskId);
    multi.zrem(this.key("tasks:user:active"), `${task.userId}:${taskId}`);
    multi.zadd(this.key("tasks:completed"), Date.parse(now), taskId);
    multi.zadd(this.key("tasks:user:completed"), Date.parse(now), `${task.userId}:${taskId}`);

    await multi.exec();
    return true;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task) return false;

    const multi = this.redis.multi();
    multi.del(this.key(`task:${taskId}`));
    multi.del(this.key(`task:${taskId}:events`));

    if (task.archived) {
      multi.zrem(this.key("tasks:archived"), taskId);
      multi.zrem(this.key("tasks:user:archived"), `${task.userId}:${taskId}`);
    } else {
      multi.zrem(this.key("tasks:completed"), taskId);
      multi.zrem(this.key("tasks:user:completed"), `${task.userId}:${taskId}`);
    }

    await multi.exec();
    return true;
  }

  async recallTask(taskId: string): Promise<TaskRecallResult | null> {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }

    const events = await this.getTaskEvents(taskId);
    const messages: TaskRecallResult["messages"] = [];

    // Extract messages from events
    for (const event of events) {
      if (event.type === "message_recorded" && event.data["message"]) {
        const msgData = event.data["message"] as Record<string, unknown>;
        const validRoles = ["system", "user", "assistant", "tool"] as const;

        const idValue = msgData["id"];
        const contentValue = msgData["content"];
        const nameValue = msgData["name"];
        const toolCallIdValue = msgData["tool_call_id"];

        const msg: typeof messages[0] = {
          id: typeof idValue === "string" ? idValue : event.timestamp,
          role: validRoles.includes(msgData["role"] as typeof validRoles[number]) ? msgData["role"] as typeof validRoles[number] : "user",
          content: typeof contentValue === "string" ? contentValue : "",
          createdAt: event.timestamp
        };
        if (typeof nameValue === "string") {
          msg.name = nameValue;
        }
        if (typeof toolCallIdValue === "string") {
          msg.tool_call_id = toolCallIdValue;
        }
        if (msgData["tool_calls"]) {
          msg.tool_calls = msgData["tool_calls"] as typeof msg.tool_calls;
        }
        messages.push(msg);
      }
    }

    return {
      task,
      sections: task.sections ? Object.fromEntries(
        Object.entries(task.sections).map(([name, description]) => [
          name,
          { name, description, content: "" }
        ])
      ) : {},
      messages
    };
  }
}
