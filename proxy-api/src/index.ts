import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { logger } from './lib/logger';
import { registerV1Routes } from './routes/v1';
import { registerApiRoutes } from './routes/api';
import { registerBernardRoutes } from './routes/bernard';
import { registerIndexRoutes } from './routes/index';
import { registerAuthRoutes } from './routes/auth';
import { registerAdminServicesRoutes } from './routes/adminServices';
import { getAuthenticatedUser } from './lib/auth/auth';
import { registerLangGraphRoutes } from './routes/langgraph';

const fastify = Fastify({
  logger: false, // Disable Fastify's built-in logging, we'll do our own
  disableRequestLogging: true,
});

// Register plugins
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await fastify.register(cookie);

// await fastify.register(multipart); // Disabled to allow proxy to forward raw multipart

// Authentication middleware for protected routes
fastify.addHook('preHandler', async (request, reply) => {
  const { url } = request;

  // Skip auth for public routes and LangGraph SDK endpoints (X-Api-Key auth is handled by upstream)
  if (
    url === '/' ||
    url.startsWith('/health') ||
    url.startsWith('/auth/') ||
    url.startsWith('/bernard/') || // Bernard UI is handled separately
    url.startsWith('/@vite/') || // Vite client resources
    url.startsWith('/src/') || // Vite source files
    url === '/@react-refresh' || // Vite React refresh
    url === '/info' ||
    url.startsWith('/threads') ||
    url.startsWith('/runs') ||
    url.startsWith('/assistants')
  ) {
    return;
  }

  // Check authentication for protected routes
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    logger.warn({ url, method: request.method }, 'Unauthorized access attempt');
    return reply.status(401).send({ error: 'Authentication required' });
  }

  // Attach user to request for downstream handlers
  (request as any).user = authUser.user;
  (request as any).sessionId = authUser.sessionId;
});

// Custom request logging
fastify.addHook('onResponse', (request, reply, done) => {
  const { method, url } = request;
  const { statusCode } = reply;
  const duration = reply.elapsedTime.toFixed(2);
  
  if (url === '/' || url.startsWith('/health')) {
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
fastify.setErrorHandler((error: any, request, reply) => {
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
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });
});

// Register routes
await fastify.register(registerIndexRoutes); // This handles / and /health
await fastify.register(registerAuthRoutes, { prefix: '/auth' });
await fastify.register(registerV1Routes, { prefix: '/v1' });
await fastify.register(registerApiRoutes, { prefix: '/api' });
await fastify.register(registerBernardRoutes); // Handles /bernard/
await fastify.register(registerAdminServicesRoutes); // Handles /admin/services/*
await fastify.register(registerLangGraphRoutes); // Handles langgraph routes

const port = Number(process.env.PORT) || 3456;
const host = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port, host });
  logger.info(`🚀 Unified Bernard Server running at http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

