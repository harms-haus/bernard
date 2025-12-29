import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { logger } from '@/lib/logger'

const BERNARD_API_URL = process.env.BERNARD_API_URL || 'http://127.0.0.1:8800';

export async function registerApiRoutes(fastify: FastifyInstance) {
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
}
