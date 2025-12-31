import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SettingsStore, ServicesSettingsSchema, BackupSettingsSchema, OAuthSettingsSchema, ModelsSettingsSchema } from "../lib/settingsStore";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

export function registerSettingsRoutes(fastify: FastifyInstance) {
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

  // GET /settings/models - Get models settings
  fastify.get("/models", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const models = await store.getModels();
      logger.info({ action: "settings.models.read", adminId: admin.user.id });
      return reply.send(models);
    } catch (error) {
      logger.error({ error }, "Failed to get models settings");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // PUT /settings/models - Update models settings
  fastify.put("/models", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const parsed = ModelsSettingsSchema.parse(request.body);
      const saved = await store.setModels(parsed);
      logger.info({ action: "settings.models.update", adminId: admin.user.id });
      return reply.send(saved);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.models.update" }, "Failed to update models settings");
      return reply.status(400).send({ error: "Invalid models payload", reason });
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

      const parsed = ServicesSettingsSchema.parse(request.body);
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

      const parsed = BackupSettingsSchema.parse(request.body);
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

      const parsed = OAuthSettingsSchema.parse(request.body);
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
      logger.error({ error, action: "settings.oauth.update" }, "Failed to update oauth settings");
      return reply.status(400).send({ error: "Invalid oauth payload", reason });
    }
  });

  // POST /settings/services/test/home-assistant - Test Home Assistant connection
  fastify.post("/services/test/home-assistant", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const services = await store.getServices();
      const haConfig = services.homeAssistant;

      if (!haConfig?.baseUrl) {
        return reply.status(400).send({
          status: "failed",
          error: "Home Assistant is not configured",
          errorType: "configuration",
          testedAt: new Date().toISOString()
        });
      }

      if (!haConfig.accessToken) {
        return reply.status(400).send({
          status: "failed",
          error: "Access token is not configured",
          errorType: "configuration",
          testedAt: new Date().toISOString()
        });
      }

      const baseUrl = haConfig.baseUrl.replace(/\/$/, "");
      const apiUrl = `${baseUrl}/api/`;

      try {
        const response = await fetch(apiUrl, {
          headers: {
            "Authorization": `Bearer ${haConfig.accessToken}`,
            "Content-Type": "application/json"
          }
        });

        if (response.ok) {
          logger.info({ action: "settings.services.test.ha", adminId: admin.user.id, status: "success" });
          return reply.send({
            status: "success",
            message: "Successfully connected to Home Assistant",
            testedAt: new Date().toISOString()
          });
        } else if (response.status === 401) {
          logger.warn({ action: "settings.services.test.ha", adminId: admin.user.id, status: "unauthorized" });
          return reply.status(401).send({
            status: "failed",
            error: "Invalid or expired access token",
            errorType: "unauthorized",
            testedAt: new Date().toISOString()
          });
        } else {
          const errorText = await response.text().catch(() => "");
          logger.error({ action: "settings.services.test.ha", adminId: admin.user.id, status: response.status, error: errorText });
          return reply.status(response.status).send({
            status: "failed",
            error: `Home Assistant returned error: ${response.status} ${response.statusText}`,
            errorType: "server_error",
            testedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown connection error";
        logger.error({ action: "settings.services.test.ha", adminId: admin.user.id, error: errorMessage });
        return reply.status(500).send({
          status: "failed",
          error: `Cannot connect to Home Assistant: ${errorMessage}`,
          errorType: "connection",
          testedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.services.test.ha" }, "Failed to test Home Assistant connection");
      return reply.status(500).send({
        status: "failed",
        error: errorMessage,
        errorType: "unknown",
        testedAt: new Date().toISOString()
      });
    }
  });

  // POST /settings/services/test/plex - Test Plex connection
  fastify.post("/services/test/plex", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const services = await store.getServices();
      const plexConfig = services.plex;

      if (!plexConfig?.baseUrl) {
        return reply.status(400).send({
          status: "failed",
          error: "Plex is not configured",
          errorType: "configuration",
          testedAt: new Date().toISOString()
        });
      }

      if (!plexConfig.token) {
        return reply.status(400).send({
          status: "failed",
          error: "Plex token is not configured",
          errorType: "configuration",
          testedAt: new Date().toISOString()
        });
      }

      const baseUrl = plexConfig.baseUrl.replace(/\/$/, "");
      const identityUrl = `${baseUrl}/identity`;

      try {
        const response = await fetch(identityUrl, {
          headers: {
            "X-Plex-Token": plexConfig.token
          }
        });

        if (response.ok) {
          // Plex returns XML, try to parse machineIdentifier
          const text = await response.text();
          const machineIdMatch = text.match(/machineIdentifier="([^"]+)"/);
          const machineIdentifier = machineIdMatch ? machineIdMatch[1] : undefined;

          logger.info({ action: "settings.services.test.plex", adminId: admin.user.id, status: "success", machineIdentifier });
          return reply.send({
            status: "success",
            message: "Successfully connected to Plex Media Server",
            machineIdentifier,
            testedAt: new Date().toISOString()
          });
        } else if (response.status === 401) {
          logger.warn({ action: "settings.services.test.plex", adminId: admin.user.id, status: "unauthorized" });
          return reply.status(401).send({
            status: "failed",
            error: "Invalid or expired Plex token",
            errorType: "unauthorized",
            testedAt: new Date().toISOString()
          });
        } else {
          const errorText = await response.text().catch(() => "");
          logger.error({ action: "settings.services.test.plex", adminId: admin.user.id, status: response.status, error: errorText });
          return reply.status(response.status).send({
            status: "failed",
            error: `Plex returned error: ${response.status} ${response.statusText}`,
            errorType: "server_error",
            testedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown connection error";
        logger.error({ action: "settings.services.test.plex", adminId: admin.user.id, error: errorMessage });
        return reply.status(500).send({
          status: "failed",
          error: `Cannot connect to Plex: ${errorMessage}`,
          errorType: "connection",
          testedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.services.test.plex" }, "Failed to test Plex connection");
      return reply.status(500).send({
        status: "failed",
        error: errorMessage,
        errorType: "unknown",
        testedAt: new Date().toISOString()
      });
    }
  });

  // POST /settings/services/test/tts - Test TTS connection
  fastify.post("/services/test/tts", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const services = await store.getServices();
      const ttsConfig = services.tts;

      if (!ttsConfig?.baseUrl) {
        return reply.status(400).send({
          status: "failed",
          error: "TTS service is not configured",
          errorType: "configuration",
          testedAt: new Date().toISOString()
        });
      }

      const baseUrl = ttsConfig.baseUrl.replace(/\/$/, "");
      const healthUrl = `${baseUrl}/health`;

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (ttsConfig.apiKey) {
          headers["Authorization"] = `Bearer ${ttsConfig.apiKey}`;
        }

        const response = await fetch(healthUrl, { headers });

        if (response.ok || response.status === 404) {
          logger.info({ action: "settings.services.test.tts", adminId: admin.user.id, status: "success" });
          return reply.send({
            status: "success",
            message: "Successfully connected to TTS service",
            testedAt: new Date().toISOString()
          });
        } else if (response.status === 401) {
          logger.warn({ action: "settings.services.test.tts", adminId: admin.user.id, status: "unauthorized" });
          return reply.status(401).send({
            status: "failed",
            error: "Invalid or expired access token",
            errorType: "unauthorized",
            testedAt: new Date().toISOString()
          });
        } else {
          const errorText = await response.text().catch(() => "");
          logger.error({ action: "settings.services.test.tts", adminId: admin.user.id, status: response.status, error: errorText });
          return reply.status(response.status).send({
            status: "failed",
            error: `TTS service returned error: ${response.status} ${response.statusText}`,
            errorType: "server_error",
            testedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown connection error";
        logger.error({ action: "settings.services.test.tts", adminId: admin.user.id, error: errorMessage });
        return reply.status(500).send({
          status: "failed",
          error: `Cannot connect to TTS service: ${errorMessage}`,
          errorType: "connection",
          testedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.services.test.tts" }, "Failed to test TTS connection");
      return reply.status(500).send({
        status: "failed",
        error: errorMessage,
        errorType: "unknown",
        testedAt: new Date().toISOString()
      });
    }
  });

  // POST /settings/services/test/stt - Test STT connection
  fastify.post("/services/test/stt", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const services = await store.getServices();
      const sttConfig = services.stt;

      if (!sttConfig?.baseUrl) {
        return reply.status(400).send({
          status: "failed",
          error: "STT service is not configured",
          errorType: "configuration",
          testedAt: new Date().toISOString()
        });
      }

      const baseUrl = sttConfig.baseUrl.replace(/\/$/, "");
      const healthUrl = `${baseUrl}/health`;

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (sttConfig.apiKey) {
          headers["Authorization"] = `Bearer ${sttConfig.apiKey}`;
        }

        const response = await fetch(healthUrl, { headers });

        if (response.ok || response.status === 404) {
          logger.info({ action: "settings.services.test.stt", adminId: admin.user.id, status: "success" });
          return reply.send({
            status: "success",
            message: "Successfully connected to STT service",
            testedAt: new Date().toISOString()
          });
        } else if (response.status === 401) {
          logger.warn({ action: "settings.services.test.stt", adminId: admin.user.id, status: "unauthorized" });
          return reply.status(401).send({
            status: "failed",
            error: "Invalid or expired access token",
            errorType: "unauthorized",
            testedAt: new Date().toISOString()
          });
        } else {
          const errorText = await response.text().catch(() => "");
          logger.error({ action: "settings.services.test.stt", adminId: admin.user.id, status: response.status, error: errorText });
          return reply.status(response.status).send({
            status: "failed",
            error: `STT service returned error: ${response.status} ${response.statusText}`,
            errorType: "server_error",
            testedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown connection error";
        logger.error({ action: "settings.services.test.stt", adminId: admin.user.id, error: errorMessage });
        return reply.status(500).send({
          status: "failed",
          error: `Cannot connect to STT service: ${errorMessage}`,
          errorType: "connection",
          testedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, action: "settings.services.test.stt" }, "Failed to test STT connection");
      return reply.status(500).send({
        status: "failed",
        error: errorMessage,
        errorType: "unknown",
        testedAt: new Date().toISOString()
      });
    }
  });
}
