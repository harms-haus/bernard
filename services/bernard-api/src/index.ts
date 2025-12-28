import "dotenv/config";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import proxy from "@fastify/http-proxy";
import { logger } from "./lib/logger";
import { registerSettingsRoutes } from "./routes/settings";
import { registerAuthRoutes } from "./routes/auth";
import { getAuthenticatedUser } from "./lib/auth";
import type { AuthenticatedUser } from "./lib/auth";

const BERNARD_AGENT_URL = process.env["BERNARD_AGENT_URL"] || "http://localhost:3001";

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
    url?.startsWith("/auth/validate")
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
  
  if (url === "/" || url?.startsWith("/health")) {
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

// 1. Agent Chat Proxy -> Bernard Agent (3001)
// This is exposed as /api/chat from the gateway, which is stripped to /chat here
await fastify.register(proxy, {
  upstream: BERNARD_AGENT_URL,
  prefix: "/chat",
  rewritePrefix: "/api/chat", // The agent service expects /api/chat
  http2: false,
});

// 2. OpenAI V1 Proxy -> Bernard Agent (3001)
// Handles /v1/chat/completions, etc.
await fastify.register(proxy, {
  upstream: BERNARD_AGENT_URL,
  prefix: "/v1",
  rewritePrefix: "/api/v1", // We'll update the agent to handle /api/v1
  http2: false,
});

// Register routes
await fastify.register(registerSettingsRoutes, { prefix: "/settings" });
await fastify.register(registerAuthRoutes, { prefix: "/auth" });

const port = Number(process.env["PORT"]) || 3000;
const host = process.env["HOST"] || "localhost";

try {
  await fastify.listen({ port, host });
  logger.info(`🚀 Bernard API Server running at http://${host}:${port}`);
} catch (err) {
  logger.error({ err, port, host }, "Failed to start Bernard API server");
  console.error("Failed to start Bernard API:", err);
  process.exit(1);
}
