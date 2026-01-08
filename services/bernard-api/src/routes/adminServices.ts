import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logging/logger";

const execAsync = promisify(exec);

const SERVICE_SCRIPTS: Record<string, string> = {
  redis: "scripts/redis.sh",
  vllm: "scripts/vllm.sh",
  kokoro: "scripts/kokoro.sh",
  whisper: "scripts/whisper.sh",
  bernard: "scripts/bernard.sh",
  "bernard-api": "scripts/bernard-api.sh",
  "bernard-ui": "scripts/bernard-ui.sh"
};

export function registerAdminServicesRoutes(fastify: FastifyInstance) {
  // POST /admin/services/restart - Restart a service
  fastify.post<{ Body: { service?: unknown } }>("/admin/services/restart", async (
    request: FastifyRequest<{ Body: { service?: unknown } }>,
    reply: FastifyReply
  ) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const body = request.body;
      const service = body?.service;

      if (!service || typeof service !== "string") {
        return reply.status(400).send({
          error: "Service name is required",
          availableServices: Object.keys(SERVICE_SCRIPTS)
        });
      }

      const scriptPath = SERVICE_SCRIPTS[service];
      if (!scriptPath) {
        return reply.status(400).send({
          error: "Invalid service name",
          availableServices: Object.keys(SERVICE_SCRIPTS)
        });
      }

      const fullPath = `${process.cwd()}/../${scriptPath}`;
      const { stdout, stderr } = await execAsync(`${fullPath} restart`);

      logger.info({ action: "services.restart", adminId: admin.user.id, service });
      return reply.send({
        success: true,
        service,
        message: `Restart initiated for ${service}`,
        output: stdout || stderr
      });
    } catch (error) {
      logger.error({ error }, "Failed to restart service");
      return reply.status(500).send({
        error: "Failed to restart service",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /admin/services - List available services
  fastify.get("/admin/services", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const services = Object.entries(SERVICE_SCRIPTS).map(([id, script]) => ({
        id,
        script,
        available: true
      }));

      return reply.send({ services });
    } catch (error) {
      logger.error({ error }, "Failed to list services");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
