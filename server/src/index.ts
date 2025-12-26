import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { logger } from './lib/logger.js';
import { registerV1Routes } from './routes/v1.js';
import { registerBernardRoutes } from './routes/bernard.js';
import { registerIndexRoutes } from './routes/index.js';

const fastify = Fastify({
  logger: false, // Disable Fastify's built-in logging, we'll do our own
  disableRequestLogging: true,
});

// Register plugins
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await fastify.register(multipart);

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
await fastify.register(registerIndexRoutes);
await fastify.register(registerV1Routes, { prefix: '/v1' });
await fastify.register(registerBernardRoutes, { prefix: '/bernard' });

const port = Number(process.env.PORT) || 3456;
const host = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port, host });
  logger.info(`🚀 Unified Bernard Server running at http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

