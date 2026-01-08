import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getRedis } from "@shared/infra/redis";
import { TokenStore } from "@shared/auth";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logging/logger";

export function registerTokenRoutes(fastify: FastifyInstance) {
  const getTokenStore = () => new TokenStore(getRedis());

  // GET /tokens - List all tokens (admin only)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const store = getTokenStore();
      const tokens = await store.list();

      // Return tokens without the secret token field
      const sanitizedTokens = tokens.map(({ token, ...rest }) => {
        void token;
        return { ...rest, status: rest.status === "revoked" ? "disabled" : rest.status };
      });

      logger.info({ action: "tokens.read", adminId: admin.user.id, count: tokens.length });
      return reply.send({ tokens: sanitizedTokens });
    } catch (error) {
      logger.error({ error }, "Failed to list tokens");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /tokens - Create a new token (admin only)
  fastify.post<{ Body: { name: string } }>("/", async (request: FastifyRequest<{ Body: { name: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { name } = request.body;
      if (!name || typeof name !== "string") {
        return reply.status(400).send({ error: "Token name is required" });
      }

      const store = getTokenStore();
      const record = await store.create(name);

      logger.info({ action: "tokens.create", adminId: admin.user.id, tokenId: record.id, name: record.name });
      return reply.status(201).send({
        token: {
          id: record.id,
          name: record.name,
          status: record.status,
          createdAt: record.createdAt,
          token: record.token // Only returned on creation
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create token";
      logger.error({ error }, "Failed to create token");
      return reply.status(400).send({ error: message });
    }
  });

  // GET /tokens/:id - Get a specific token (admin only)
  fastify.get<{ Params: { id: string } }>("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const store = getTokenStore();
      const token = await store.get(id);

      if (!token) {
        return reply.status(404).send({ error: "Token not found" });
      }

      const { token: _secret, ...result } = token;
      logger.info({ action: "tokens.read_one", adminId: admin.user.id, tokenId: id });
      void _secret;
      return reply.send({ token: { ...result, status: result.status === "revoked" ? "disabled" : result.status } });
    } catch (error) {
      logger.error({ error }, "Failed to get token");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // PATCH /tokens/:id - Update a token (admin only)
  fastify.patch<{ Params: { id: string }; Body: { name?: string; status?: "active" | "disabled" } }>(
    "/:id",
    async (request: FastifyRequest<{
      Params: { id: string };
      Body: { name?: string; status?: "active" | "disabled" };
    }>, reply: FastifyReply) => {
      try {
        const admin = await requireAdmin(request);
        if (!admin) {
          return reply.status(403).send({ error: "Admin access required" });
        }

        const { id } = request.params;
        const { name, status } = request.body;

        if (!name && !status) {
          return reply.status(400).send({ error: "At least one field (name or status) is required" });
        }

        const store = getTokenStore();
        const updates: { name?: string; status?: "active" | "revoked" } = {};

        if (name) updates.name = name;
        if (status) updates.status = status === "disabled" ? "revoked" : "active";

        const updated = await store.update(id, updates);

        if (!updated) {
          return reply.status(404).send({ error: "Token not found" });
        }

        logger.info({ action: "tokens.update", adminId: admin.user.id, tokenId: id, updates });
        const { token: _secret, ...result } = updated;
        void _secret;
        return reply.send({ token: { ...result, status: result.status === "revoked" ? "disabled" : result.status } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update token";
        logger.error({ error }, "Failed to update token");
        return reply.status(400).send({ error: message });
      }
    }
  );

  // DELETE /tokens/:id - Delete a token (admin only)
  fastify.delete<{ Params: { id: string } }>("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const store = getTokenStore();
      const deleted = await store.delete(id);

      if (!deleted) {
        return reply.status(404).send({ error: "Token not found" });
      }

      logger.info({ action: "tokens.delete", adminId: admin.user.id, tokenId: id });
      return reply.status(204).send();
    } catch (error) {
      logger.error({ error }, "Failed to delete token");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
