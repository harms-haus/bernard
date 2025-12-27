import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SettingsStore, ServicesSettingsSchema, BackupSettingsSchema, OAuthSettingsSchema } from "../lib/settingsStore";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

export async function registerSettingsRoutes(fastify: FastifyInstance) {
  const store = new SettingsStore();

  // GET /settings - Get all settings
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const settings = await store.getAll();
      logger.info({ action: "settings.read", adminId: admin.user.id });
      return reply.send(settings);
    } catch (error) {
      logger.error({ error }, "Failed to get settings");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // GET /settings/services - Get services settings
  fastify.get("/services", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const services = await store.getServices();
      logger.info({ action: "settings.services.read", adminId: admin.user.id });
      return reply.send(services);
    } catch (error) {
      logger.error({ error }, "Failed to get services settings");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // PUT /settings/services - Update services settings
  fastify.put("/services", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const body = request.body as unknown;
      const parsed = ServicesSettingsSchema.parse(body);
      const before = await store.getServices();
      const saved = await store.setServices(parsed);
      const changed = Object.keys(parsed).filter(
        (key) => JSON.stringify((before as Record<string, unknown>)[key]) !== JSON.stringify((parsed as Record<string, unknown>)[key])
      );
      
      logger.info({
        action: "settings.services.update",
        adminId: admin.user.id,
        changed
      });
      return reply.send(saved);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.services.update" }, "Failed to update services settings");
      return reply.status(400).send({ error: "Invalid services payload", reason });
    }
  });

  // GET /settings/backups - Get backup settings
  fastify.get("/backups", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const backups = await store.getBackups();
      logger.info({ action: "settings.backups.read", adminId: admin.user.id });
      return reply.send(backups);
    } catch (error) {
      logger.error({ error }, "Failed to get backup settings");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // PUT /settings/backups - Update backup settings
  fastify.put("/backups", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const body = request.body as unknown;
      const parsed = BackupSettingsSchema.parse(body);
      const before = await store.getBackups();
      await store.setBackups(parsed);
      const changed = Object.keys(parsed).filter(
        (key) => (before as Record<string, unknown>)[key] !== (parsed as Record<string, unknown>)[key]
      );
      
      logger.info({
        action: "settings.backups.update",
        adminId: admin.user.id,
        changed
      });
      return reply.send(parsed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.backups.update" }, "Failed to update backup settings");
      return reply.status(400).send({ error: "Invalid backup payload", reason });
    }
  });

  // GET /settings/oauth - Get OAuth settings
  fastify.get("/oauth", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const oauth = await store.getOAuth();
      logger.info({ action: "settings.oauth.read", adminId: admin.user.id });
      return reply.send(oauth);
    } catch (error) {
      logger.error({ error }, "Failed to get OAuth settings");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // PUT /settings/oauth - Update OAuth settings
  fastify.put("/oauth", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const body = request.body as unknown;
      const parsed = OAuthSettingsSchema.parse(body);
      const before = await store.getOAuth();
      await store.setOAuth(parsed);
      const changed = Object.keys(parsed).filter(
        (key) => JSON.stringify((before as Record<string, unknown>)[key]) !== JSON.stringify((parsed as Record<string, unknown>)[key])
      );
      
      logger.info({
        action: "settings.oauth.update",
        adminId: admin.user.id,
        changed
      });
      return reply.send(parsed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.oauth.update" }, "Failed to update OAuth settings");
      return reply.status(400).send({ error: "Invalid oauth payload", reason });
    }
  });
}
