import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { logger } from '@/lib/logger'

const BERNARD_API_URL = process.env.BERNARD_API_URL || 'http://127.0.0.1:8800';
const UI_URL = process.env.BERNARD_UI_URL || 'http://127.0.0.1:8810';

export async function registerBernardRoutes(fastify: FastifyInstance) {
  // 1. Bernard API Proxy
  // Maps /bernard/api/* to bernard-api:8800
  // Strips /bernard/api prefix so bernard-api receives clean paths like /settings
  fastify.register(proxy, {
    upstream: BERNARD_API_URL,
    prefix: '/bernard/api',
    rewritePrefix: '',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard API)', error: error.message, upstream: BERNARD_API_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-api' });
    }
  } as any);

  // 2. Bernard UI Proxy
  // Maps /bernard/* to bernard-ui:8810
  // Strips /bernard prefix as UI base is now '/' (Option A)
  fastify.register(proxy, {
    upstream: UI_URL,
    prefix: '/bernard',
    rewritePrefix: '',
    http2: false,
    websocket: true,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard UI)', error: error.message, upstream: UI_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-ui' });
    }
  } as any);
}
