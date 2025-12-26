import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { logger } from '../lib/logger.js';

const BERNARD_URL = process.env.BERNARD_URL || 'http://localhost:3000';
const UI_URL = process.env.UI_URL || 'http://localhost:4200';

export async function registerBernardRoutes(fastify: FastifyInstance) {
  // 1. API proxy -> Next.js /api
  fastify.register(proxy, {
    upstream: BERNARD_URL,
    prefix: '/api',
    rewritePrefix: '/api',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard API)', error: error.message, upstream: BERNARD_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-api' });
    }
  } as any);

  // 2. UI proxy -> Vite (everything else)
  fastify.register(proxy, {
    upstream: UI_URL,
    prefix: '/',
    rewritePrefix: '/',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard UI)', error: error.message, upstream: UI_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-ui' });
    }
  } as any);
}

