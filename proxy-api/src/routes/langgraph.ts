import { FastifyInstance, FastifyRequest } from "fastify";
import proxy from '@fastify/http-proxy';
import { logger } from '@/lib/logger'

const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';


function passThroughAuth(req: FastifyRequest, headers: Record<string, string>) {
  const authHeader = req.headers.authorization;
  const cookie = req.headers.cookie;
  const apiKey = req.headers['x-api-key'];
  return {
    ...headers,
    ...(authHeader ? { authorization: authHeader } : {}),
    ...(cookie ? { cookie } : {}),
    ...(apiKey ? { 'x-api-key': apiKey as string } : {}),
  };
}

export async function registerLangGraphRoutes(fastify: FastifyInstance) {
  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/threads/search',
    rewritePrefix: '/threads/search',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Threads Search)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/threads',
    rewritePrefix: '/threads',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Threads)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/runs/stream',
    rewritePrefix: '/runs/stream',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Runs Stream)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/runs',
    rewritePrefix: '/runs',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Runs)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/assistants/search',
    rewritePrefix: '/assistants/search',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Assistants Search)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/assistants',
    rewritePrefix: '/assistants',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Assistants)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/crons',
    rewritePrefix: '/crons',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Crons)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/store',
    rewritePrefix: '/store',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Store)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);
}
