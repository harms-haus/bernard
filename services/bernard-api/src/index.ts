import "dotenv/config";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { logger } from "./lib/logger";
import { registerSettingsRoutes } from "./routes/settings";
import { registerAuthRoutes } from "./routes/auth";
import { registerProviderRoutes } from "./routes/providers";
import { registerTokenRoutes } from "./routes/tokens";
import { registerUserRoutes } from "./routes/users";
import { registerTaskRoutes } from "./routes/tasks";
import { registerAdminServicesRoutes } from "./routes/adminServices";
import { registerThreadsRoutes } from "./routes/threads";
import { getAuthenticatedUser } from "./lib/auth";
import type { AuthenticatedUser } from "./lib/auth";

const fastify = Fastify({
  logger: false, // Disable Fastify's built-in logging, we'll do our own
  disableRequestLogging: true,
});

// Register plugins
await fastify.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await fastify.register(cookie);

// Extend FastifyRequest to include user and sessionId
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser["user"];
    sessionId?: string | null;
  }
}

// Authentication middleware for protected routes
fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
  const { url } = request;

  // Skip auth for public routes
  if (
    url === "/" ||
    url?.startsWith("/health") ||
    url === "/api/auth/validate" // Token validation called by other services with token in body
  ) {
    return;
  }

  // Check authentication for protected routes
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    logger.warn({ url, method: request.method }, "Unauthorized access attempt");
    return reply.status(401).send({ error: "Authentication required" });
  }

  // Attach user to request for downstream handlers
  request.user = authUser.user;
  request.sessionId = authUser.sessionId;
});

// Custom request logging
fastify.addHook("onResponse", (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
  const { method, url } = request;
  const { statusCode } = reply;
  const duration = reply.elapsedTime.toFixed(2);

  if (url === "/" || url?.startsWith("/health") || url?.startsWith("/api/health")) {
    // Silent for root/health
  } else {
    if (statusCode >= 400) {
      logger.error(`${method} ${url} - ${statusCode} (${duration}ms)`);
    } else {
      logger.info(`${method} ${url} - ${statusCode} (${duration}ms)`);
    }
  }
  done();
});

// Global Error Handler
fastify.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request: FastifyRequest, reply: FastifyReply) => {
  const { method, url } = request;
  logger.error({
    msg: `🔥 Error in ${method} ${url}`,
    error: error.message,
    stack: error.stack,
    code: error.code,
    statusCode: error.statusCode,
  });

  reply.status(error.statusCode || 500).send({
    error: true,
    message: error.message,
    code: error.code,
    stack: process.env["NODE_ENV"] === "development" ? error.stack : undefined,
  });
});

// Health check
fastify.get("/health", async (request, reply) => {
  return reply.send({ status: "ok", service: "bernard-api" });
});

// Status endpoint
fastify.get("/api/status", async (request: FastifyRequest, reply: FastifyReply) => {
  const includeServices = request.query && (request.query as any).services === 'true';
  const includeLogs = request.query && (request.query as any).logs === 'true';

  const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:8850';
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  const statusData: {
    status: 'online' | 'degraded' | 'offline';
    uptimeSeconds: number;
    startedAt: string;
    version?: string;
    lastActivityAt: string;
    activeConversations: number;
    tokensActive: number;
    queueSize: number;
    notes?: string;
    services?: Array<{
      name: string;
      port: number;
      description: string;
      status: 'online' | 'degraded' | 'offline';
      error?: string;
      logs?: string[];
    }>;
  } = {
    status: 'online',
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
    version: process.env.npm_package_version,
    lastActivityAt: new Date().toISOString(),
    activeConversations: 0,
    tokensActive: 0,
    queueSize: 0,
  };

  if (includeServices) {
    const services: Array<{
      name: string;
      port: number;
      description: string;
      status: 'online' | 'degraded' | 'offline';
      error?: string;
      logs?: string[];
    }> = [];

    // Check Redis
    try {
      const Redis = (await import('ioredis')).default;
      const redisClient = new Redis(REDIS_URL);
      const ping = await redisClient.ping();
      services.push({
        name: 'Redis',
        port: parseInt(new URL(REDIS_URL).port || '6379'),
        description: 'Cache and session storage',
        status: ping === 'PONG' ? 'online' : 'degraded',
      });
      await redisClient.quit();
    } catch (error) {
      services.push({
        name: 'Redis',
        port: parseInt(new URL(REDIS_URL).port || '6379'),
        description: 'Cache and session storage',
        status: 'offline' as const,
        error: error instanceof Error ? error.message : String(error),
        logs: includeLogs ? ['Failed to connect to Redis'] : undefined,
      });
    }

    // Check Bernard Agent
    try {
      const response = await fetch(`${BERNARD_AGENT_URL}/health`, { signal: AbortSignal.timeout(2000) });
      services.push({
        name: 'Bernard',
        port: parseInt(new URL(BERNARD_AGENT_URL).port || '8850'),
        description: 'AI agent and chat processing',
        status: response.ok ? 'online' as const : 'degraded' as const,
      });
    } catch (error) {
      services.push({
        name: 'Bernard',
        port: parseInt(new URL(BERNARD_AGENT_URL).port || '8850'),
        description: 'AI agent and chat processing',
        status: 'offline' as const,
        error: error instanceof Error ? error.message : String(error),
        logs: includeLogs ? ['Failed to connect to Bernard agent'] : undefined,
      });
    }

    // Check Bernard API itself
    services.push({
      name: 'Server',
      port: Number(process.env.BERNARD_API_PORT) || 8800,
      description: 'This API server',
      status: 'online' as const,
    });

    statusData.services = services;

    // Determine overall status
    const offlineServices = services.filter(s => s.status === 'offline');
    const degradedServices = services.filter(s => s.status === 'degraded');

    if (offlineServices.length > 0) {
      statusData.status = 'offline';
      statusData.notes = `Offline services: ${offlineServices.map(s => s.name).join(', ')}`;
    } else if (degradedServices.length > 0) {
      statusData.status = 'degraded';
      statusData.notes = `Degraded services: ${degradedServices.map(s => s.name).join(', ')}`;
    }
  }

  return reply.send(statusData);
});

// Register routes
await fastify.register(registerSettingsRoutes, { prefix: "/api/settings" });
await fastify.register(registerAuthRoutes, { prefix: "/api/auth" });
await fastify.register(registerProviderRoutes, { prefix: "/api/providers" });
await fastify.register(registerTokenRoutes, { prefix: "/api/tokens" });
await fastify.register(registerUserRoutes, { prefix: "/api/users" });
await fastify.register(registerTaskRoutes, { prefix: "/api/tasks" });
await fastify.register(registerAdminServicesRoutes);
await fastify.register(registerThreadsRoutes, { prefix: "/api" });

const port = Number(process.env["BERNARD_API_PORT"]) || 8800;
const host = process.env["HOST"] || "127.0.0.1";

try {
  await fastify.listen({ port, host });
  logger.info(`🚀 Bernard API Server running at http://${host}:${port}`);
} catch (err) {
  logger.error({ err, port, host }, "Failed to start Bernard API server");
  console.error("Failed to start Bernard API:", err);
  process.exit(1);
}
