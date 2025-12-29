import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getRedis } from "@shared/infra/redis";
import { UserStore, UserStatus } from "@shared/auth";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

export function registerUserRoutes(fastify: FastifyInstance) {
  const getUserStore = () => new UserStore(getRedis());

  // GET /users - List all users (admin only)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const store = getUserStore();
      const users = await store.list();

      logger.info({ action: "users.read", adminId: admin.user.id, count: users.length });
      return reply.send({ users });
    } catch (error) {
      logger.error({ error }, "Failed to list users");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /users - Create a new user (admin only)
  fastify.post<{ Body: { id: string; displayName: string; isAdmin: boolean } }>("/", async (
    request: FastifyRequest<{ Body: { id: string; displayName: string; isAdmin: boolean } }>,
    reply: FastifyReply
  ) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id, displayName, isAdmin } = request.body;

      if (!id || !displayName || typeof isAdmin !== "boolean") {
        return reply.status(400).send({ error: "id, displayName, and isAdmin are required" });
      }

      const store = getUserStore();
      const user = await store.create({ id, displayName, isAdmin });

      logger.info({ action: "users.create", adminId: admin.user.id, userId: user.id });
      return reply.status(201).send({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      logger.error({ error }, "Failed to create user");
      return reply.status(400).send({ error: message });
    }
  });

  // GET /users/:id - Get a specific user (admin only)
  fastify.get<{ Params: { id: string } }>("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const store = getUserStore();
      const user = await store.get(id);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      logger.info({ action: "users.read_one", adminId: admin.user.id, userId: id });
      return reply.send({ user });
    } catch (error) {
      logger.error({ error }, "Failed to get user");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // PATCH /users/:id - Update a user (admin only)
  fastify.patch<{
    Params: { id: string };
    Body: { displayName?: string; isAdmin?: boolean; status?: UserStatus };
  }>("/:id", async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { displayName?: string; isAdmin?: boolean; status?: UserStatus };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const { displayName, isAdmin, status } = request.body;

      if (!displayName && isAdmin === undefined && !status) {
        return reply.status(400).send({ error: "At least one field is required" });
      }

      const store = getUserStore();
      const updates: { displayName?: string; isAdmin?: boolean; status?: UserStatus } = {};

      if (displayName) updates.displayName = displayName;
      if (isAdmin !== undefined) updates.isAdmin = isAdmin;
      if (status) updates.status = status;

      const updated = await store.update(id, updates);

      if (!updated) {
        return reply.status(404).send({ error: "User not found" });
      }

      logger.info({ action: "users.update", adminId: admin.user.id, userId: id, updates });
      return reply.send({ user: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update user";
      logger.error({ error }, "Failed to update user");
      return reply.status(400).send({ error: message });
    }
  });

  // DELETE /users/:id - Delete a user (admin only)
  fastify.delete<{ Params: { id: string } }>("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const store = getUserStore();
      const deleted = await store.delete(id);

      if (!deleted) {
        return reply.status(404).send({ error: "User not found" });
      }

      logger.info({ action: "users.delete", adminId: admin.user.id, userId: id });
      return reply.status(200).send({ user: deleted });
    } catch (error) {
      logger.error({ error }, "Failed to delete user");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /users/:id/reset - Reset user data (admin only)
  fastify.post<{ Params: { id: string } }>("/:id/reset", async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const store = getUserStore();
      const user = await store.get(id);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Reset user by setting status to active (no-op for now, could be expanded)
      logger.info({ action: "users.reset", adminId: admin.user.id, userId: id });
      return reply.status(200).send({ success: true, message: "User reset" });
    } catch (error) {
      logger.error({ error }, "Failed to reset user");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
