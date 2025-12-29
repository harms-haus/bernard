import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { logger } from '@/lib/logger'

const BERNARD_API_URL = process.env.BERNARD_API_URL || 'http://127.0.0.1:8800';
const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:8850';
const UI_URL = process.env.UI_URL || 'http://127.0.0.1:8810';

export async function registerBernardRoutes(fastify: FastifyInstance) {
  // Register routes in order of specificity (more specific first)
  // 1. Bernard Agent Proxy (Chat endpoints)
  // Maps /v1/* directly to bernard:8850
  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/v1',
    rewritePrefix: '',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard Agent)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-agent' });
    }
  } as any);

   // 2. Bernard API Proxy (Auth/Settings endpoints)
   // Maps /api/* to bernard-api:8800
   // Keeps /api prefix so bernard-api receives paths like /api/settings
   fastify.register(proxy, {
     upstream: BERNARD_API_URL,
     prefix: '/api',
     rewritePrefix: '/api',
     http2: false,
     errorHandler: (reply: any, error: any) => {
       logger.error({ msg: 'Proxy Error (Bernard API)', error: error.message, upstream: BERNARD_API_URL });
       reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-api' });
     }
   } as any);

  // 2. Bernard UI Proxy
  // Maps /bernard/* to bernard-ui:8810
  // Keeps /bernard prefix as UI base is '/bernard/' (Option B)
  fastify.register(proxy, {
    upstream: UI_URL,
    prefix: '/bernard',
    rewritePrefix: '/bernard',
    http2: false,
    websocket: true,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard UI)', error: error.message, upstream: UI_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-ui' });
    }
  } as any);
}
