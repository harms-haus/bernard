import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getRedis } from "@shared/infra/redis";
import { TaskRecordKeeper } from "../lib/taskKeeper";
import { getAuthenticatedUser } from "../lib/auth";
import { logger } from "../lib/logger";

export function registerTaskRoutes(fastify: FastifyInstance) {
  const getTaskKeeper = () => new TaskRecordKeeper(getRedis());

  // GET /tasks - List user's tasks
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const userId = authUser.user.id;
      const { searchParams } = new URL(request.url);
      const includeArchived = searchParams.get("includeArchived") === "true";
      const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
      const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

      const keeper = getTaskKeeper();
      const result = await keeper.listTasks({
        userId,
        includeArchived,
        limit,
        offset
      });

      return reply.send(result);
    } catch (error) {
      logger.error({ error }, "Failed to list tasks");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /tasks - Perform task action (cancel)
  fastify.post<{ Body: { action: string; taskId: string } }>("/", async (
    request: FastifyRequest<{ Body: { action: string; taskId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const userId = authUser.user.id;
      const { action, taskId } = request.body;

      if (!taskId || !action) {
        return reply.status(400).send({ error: "taskId and action are required" });
      }

      const keeper = getTaskKeeper();

      switch (action) {
        case "cancel": {
          const task = await keeper.getTask(taskId);
          if (!task) {
            return reply.status(404).send({ error: "Task not found" });
          }
          if (task.userId !== userId) {
            return reply.status(403).send({ error: "Forbidden" });
          }
          const success = await keeper.cancelTask(taskId);
          if (!success) {
            return reply.status(400).send({ error: "Cannot cancel task" });
          }
          return reply.send({ success: true });
        }
        default:
          return reply.status(400).send({ error: "Invalid action" });
      }
    } catch (error) {
      logger.error({ error }, "Failed to perform task action");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // DELETE /tasks - Delete a task
  fastify.delete<{ Querystring: { taskId: string } }>("/", async (
    request: FastifyRequest<{ Querystring: { taskId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const userId = authUser.user.id;
      const { taskId } = request.query;

      if (!taskId) {
        return reply.status(400).send({ error: "taskId is required" });
      }

      const keeper = getTaskKeeper();
      const task = await keeper.getTask(taskId);

      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }
      if (task.userId !== userId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const success = await keeper.deleteTask(taskId);
      if (!success) {
        return reply.status(400).send({ error: "Cannot delete task" });
      }

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to delete task");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // GET /tasks/:id - Get task details
  fastify.get<{ Params: { id: string } }>("/:id", async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const { id } = request.params;
      const keeper = getTaskKeeper();

      const result = await keeper.recallTask(id);
      if (!result) {
        return reply.status(404).send({ error: "Task not found" });
      }

      return reply.send(result);
    } catch (error) {
      logger.error({ error }, "Failed to get task");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
