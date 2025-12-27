import type Redis from "ioredis";
import { childLogger, logger } from "@/lib/logging";
import type { Task, TaskEvent, TaskStatus, TaskRecallResult, TaskListQuery, TaskListResponse } from "@/lib/task/types";

const DEFAULT_NAMESPACE = "bernard:task:rk";
const DEFAULT_METRICS_NAMESPACE = "bernard:task:rk:metrics";

function nowIso() {
  return new Date().toISOString();
}

/**
 * TaskRecordKeeper handles storage and retrieval of background task data.
 * Similar to RecordKeeper but simplified for task-specific operations.
 */
export class TaskRecordKeeper {
  private readonly namespace: string;
  private readonly metricsNamespace: string;
  private readonly log = childLogger({ component: "task_record_keeper" }, logger);

  constructor(
    private readonly redis: Redis,
    opts: { namespace?: string; metricsNamespace?: string } = {}
  ) {
    this.namespace = opts.namespace ?? DEFAULT_NAMESPACE;
    this.metricsNamespace = opts.metricsNamespace ?? DEFAULT_METRICS_NAMESPACE;
  }

  /**
   * Create a new task record
   */
  async createTask(taskId: string, metadata: {
    name: string;
    toolName: string;
    userId: string;
    conversationId?: string;
    sections?: Record<string, string>;
  }): Promise<Task> {
    const now = nowIso();
    const taskKey = this.key(`task:${taskId}`);

    const task: Task = {
      id: taskId,
      name: metadata.name,
      status: "queued",
      toolName: metadata.toolName,
      userId: metadata.userId,
      ...(metadata.conversationId && { conversationId: metadata.conversationId }),
      createdAt: now,
      messageCount: 0,
      toolCallCount: 0,
      tokensIn: 0,
      tokensOut: 0,
      archived: false,
      ...(metadata.sections && { sections: metadata.sections })
    };

    const taskData = {
      id: task.id,
      name: task.name,
      status: task.status,
      toolName: task.toolName,
      userId: task.userId,
      conversationId: task.conversationId || "",
      createdAt: task.createdAt,
      startedAt: task.startedAt || "",
      messageCount: task.messageCount,
      toolCallCount: task.toolCallCount,
      tokensIn: task.tokensIn,
      tokensOut: task.tokensOut,
      archived: task.archived.toString(),
      sections: task.sections ? JSON.stringify(task.sections) : ""
    };

    const multi = this.redis.multi();
    multi.hset(taskKey, taskData);
    multi.zadd(this.key("tasks:active"), Date.now(), taskId);
    multi.zadd(this.key("tasks:user:active"), Date.now(), `${metadata.userId}:${taskId}`);

    await multi.exec();

    this.log.info({
      event: "task.created",
      taskId,
      toolName: metadata.toolName,
      userId: metadata.userId
    });

    return task;
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    const taskKey = this.key(`task:${taskId}`);
    const data = await this.redis.hgetall(taskKey);

    if (!data || !data['id']) {
      return null;
    }

    let sections: Record<string, string> | undefined;
    if (data['sections']) {
      try {
        sections = JSON.parse(data['sections']) as Record<string, string>;
      } catch {
        sections = undefined;
      }
    }

    const task: Task = {
      id: data['id'],
      name: data['name'] || '',
      status: data['status'] as TaskStatus,
      toolName: data['toolName'] || '',
      userId: data['userId'] || '',
      ...(data['conversationId'] && { conversationId: data['conversationId'] }),
      createdAt: data['createdAt'] || '',
      ...(data['startedAt'] && { startedAt: data['startedAt'] }),
      ...(data['completedAt'] && { completedAt: data['completedAt'] }),
      ...(data['runtimeMs'] && { runtimeMs: Number(data['runtimeMs']) }),
      ...(data['errorMessage'] && { errorMessage: data['errorMessage'] }),
      messageCount: Number(data['messageCount']) || 0,
      toolCallCount: Number(data['toolCallCount']) || 0,
      tokensIn: Number(data['tokensIn']) || 0,
      tokensOut: Number(data['tokensOut']) || 0,
      archived: data['archived'] === "true",
      ...(data['archivedAt'] && { archivedAt: data['archivedAt'] }),
      ...(sections && { sections })
    };
    return task;
  }

  /**
   * Record a task event
   */
  async recordEvent(taskId: string, event: TaskEvent): Promise<void> {
    const taskKey = this.key(`task:${taskId}`);
    const eventsKey = this.key(`task:${taskId}:events`);

    // Store the event
    await this.redis.rpush(eventsKey, JSON.stringify(event));

    // Update task counters based on event type
    const updates: Record<string, string | number> = {};

    switch (event.type) {
      case "task_started":
        updates["status"] = "running";
        updates["startedAt"] = event.timestamp;
        break;
      case "message_recorded":
        updates["messageCount"] = 1; // Will be incremented
        break;
      case "tool_call_start":
        updates["toolCallCount"] = 1; // Will be incremented
        break;
      case "task_completed": {
        updates["status"] = "completed";
        updates["completedAt"] = event.timestamp;
        const startedAt = await this.redis.hget(taskKey, "startedAt");
        if (startedAt) {
          const runtimeMs = Date.parse(event.timestamp) - Date.parse(startedAt);
          updates["runtimeMs"] = runtimeMs;
        }
        // Move from active to completed
        await this.redis.multi()
          .zrem(this.key("tasks:active"), taskId)
          .zrem(this.key("tasks:user:active"), `${String(event.data["userId"]) || ""}:${taskId}`)
          .zadd(this.key("tasks:completed"), Date.parse(event.timestamp), taskId)
          .zadd(this.key("tasks:user:completed"), Date.parse(event.timestamp), `${String(event.data["userId"]) || ""}:${taskId}`)
          .exec();
        }
        break;
      case "error":
        updates["status"] = "errored";
        updates["errorMessage"] = String(String(event.data["error"]) || "Unknown error");
        updates["completedAt"] = event.timestamp;
        // Move from active to completed (even errored tasks go to completed)
        await this.redis.multi()
          .zrem(this.key("tasks:active"), taskId)
          .zrem(this.key("tasks:user:active"), `${String(event.data["userId"]) || ""}:${taskId}`)
          .zadd(this.key("tasks:completed"), Date.parse(event.timestamp), taskId)
          .zadd(this.key("tasks:user:completed"), Date.parse(event.timestamp), `${String(event.data["userId"]) || ""}:${taskId}`)
          .exec();
        break;
    }

    // Update token counts if provided
    if (event.data["tokensIn"] !== undefined) {
      updates["tokensIn"] = Number(event.data["tokensIn"]);
    }
    if (event.data["tokensOut"] !== undefined) {
      updates["tokensOut"] = Number(event.data["tokensOut"]);
    }

    if (Object.keys(updates).length > 0) {
      // For counters, we need to increment instead of set
      if (updates["messageCount"]) {
        await this.redis.hincrby(taskKey, "messageCount", 1);
        delete updates["messageCount"];
      }
      if (updates["toolCallCount"]) {
        await this.redis.hincrby(taskKey, "toolCallCount", 1);
        delete updates["toolCallCount"];
      }
      if (updates["tokensIn"]) {
        await this.redis.hincrby(taskKey, "tokensIn", updates["tokensIn"] as number);
        delete updates["tokensIn"];
      }
      if (updates["tokensOut"]) {
        await this.redis.hincrby(taskKey, "tokensOut", updates["tokensOut"] as number);
        delete updates["tokensOut"];
      }

      if (Object.keys(updates).length > 0) {
        await this.redis.hset(taskKey, updates);
      }
    }
  }

  /**
   * Get task events (for debugging/admin)
   */
  async getTaskEvents(taskId: string, limit?: number): Promise<TaskEvent[]> {
    const eventsKey = this.key(`task:${taskId}:events`);
    let rawEvents: string[];

    if (limit) {
      rawEvents = await this.redis.lrange(eventsKey, -limit, -1);
    } else {
      rawEvents = await this.redis.lrange(eventsKey, 0, -1);
    }

    return rawEvents.map(eventStr => {
      try {
        return JSON.parse(eventStr) as TaskEvent;
      } catch {
        return null;
      }
    }).filter((event): event is TaskEvent => event !== null);
  }

  /**
   * List tasks for a user
   */
  async listTasks(query: TaskListQuery): Promise<TaskListResponse> {
    const { userId, includeArchived = false, limit = 50, offset = 0 } = query;

    const activeKey = this.key("tasks:user:active");
    const completedKey = this.key("tasks:user:completed");
    const archivedKey = this.key("tasks:user:archived");

    // Get task IDs with scores (timestamps)
    const activeTasks = await this.redis.zrevrange(activeKey, offset, offset + limit - 1, "WITHSCORES");
    const completedTasks = await this.redis.zrevrange(completedKey, offset, offset + limit - 1, "WITHSCORES");
    const archivedTasks = includeArchived ? await this.redis.zrevrange(archivedKey, offset, offset + limit - 1, "WITHSCORES") : [];

    // Filter by userId and extract taskIds
    const allTasks = [
      ...activeTasks.filter((_, i) => i % 2 === 0 && activeTasks[i]?.startsWith(`${userId}:`)).map(item => item?.replace(`${userId}:`, "")),
      ...completedTasks.filter((_, i) => i % 2 === 0 && completedTasks[i]?.startsWith(`${userId}:`)).map(item => item?.replace(`${userId}:`, "")),
      ...(includeArchived ? archivedTasks.filter((_, i) => i % 2 === 0 && archivedTasks[i]?.startsWith(`${userId}:`)).map(item => item?.replace(`${userId}:`, "")) : [])
    ];

    // Get full task objects
    const tasks = await Promise.all(
      allTasks.slice(0, limit).map(taskId => this.getTask(taskId))
    );

    const validTasks = tasks.filter((task): task is Task => task !== null);

    return {
      tasks: validTasks,
      total: allTasks.length,
      hasMore: allTasks.length > limit
    };
  }

  /**
   * Recall task data for bernard
   */
  async recallTask(taskId: string, options?: {
    offset?: number;
    count?: number;
    section?: string;
  }): Promise<TaskRecallResult | null> {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }

    const result: TaskRecallResult = {
      task,
      ...(task.sections && {
        sections: Object.fromEntries(
          Object.entries(task.sections).map(([name, description]) => [
            name,
            { name, description, content: "" } // Content would be populated by specific task logic
          ])
        )
      }),
      messages: [] // Messages would be populated by task-specific logic
    };

    // If a specific section is requested, only return that section
    if (options?.section && result.sections) {
      const requestedSection = result.sections[options.section];
      if (requestedSection) {
        result.sections = { [options.section]: requestedSection };
      } else {
        result.sections = {};
      }
    }

    return result;
  }

  /**
   * Archive a completed task
   */
  async archiveTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task || task.archived || task.status === "running") {
      return false;
    }

    const taskKey = this.key(`task:${taskId}`);
    const now = nowIso();

    const multi = this.redis.multi();
    multi.hset(taskKey, {
      archived: "true",
      archivedAt: now
    });
    multi.zrem(this.key("tasks:completed"), taskId);
    multi.zrem(this.key("tasks:user:completed"), `${task.userId}:${taskId}`);
    multi.zadd(this.key("tasks:archived"), Date.parse(now), taskId);
    multi.zadd(this.key("tasks:user:archived"), Date.parse(now), `${task.userId}:${taskId}`);

    await multi.exec();

    this.log.info({
      event: "task.archived",
      taskId,
      userId: task.userId
    });

    return true;
  }

  /**
   * Cancel a running or queued task
   */
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

    // Move from active to completed (even cancelled tasks go to completed)
    multi.zrem(this.key("tasks:active"), taskId);
    multi.zrem(this.key("tasks:user:active"), `${task.userId}:${taskId}`);
    multi.zadd(this.key("tasks:completed"), Date.parse(now), taskId);
    multi.zadd(this.key("tasks:user:completed"), Date.parse(now), `${task.userId}:${taskId}`);

    await multi.exec();

    this.log.info({
      event: "task.cancelled",
      taskId,
      userId: task.userId
    });

    return true;
  }

  /**
   * Delete a completed task (cleanup)
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task || (task.status !== "completed" && task.status !== "errored" && task.status !== "uncompleted" && task.status !== "cancelled" && !task.archived)) {
      return false;
    }

    const multi = this.redis.multi();
    multi.del(this.key(`task:${taskId}`));
    multi.del(this.key(`task:${taskId}:events`));

    // Remove from appropriate sets based on task status
    if (task.archived) {
      multi.zrem(this.key("tasks:archived"), taskId);
      multi.zrem(this.key("tasks:user:archived"), `${task.userId}:${taskId}`);
    } else {
      multi.zrem(this.key("tasks:completed"), taskId);
      multi.zrem(this.key("tasks:user:completed"), `${task.userId}:${taskId}`);
    }

    await multi.exec();

    this.log.info({
      event: "task.deleted",
      taskId,
      userId: task.userId
    });

    return true;
  }

  /**
   * Get Redis client (for advanced operations)
   */
  getRedisClient(): Redis {
    return this.redis;
  }

  private key(suffix: string) {
    return `${this.namespace}:${suffix}`;
  }

  private metricsKey(suffix: string) {
    return `${this.metricsNamespace}:${suffix}`;
  }
}
