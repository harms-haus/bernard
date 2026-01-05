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
  // Handle history 404s for new threads
  fastify.post('/threads/:threadId/history', async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const authHeaders = passThroughAuth(request, {
      'Content-Type': 'application/json',
    });

    try {
      const response = await fetch(`${BERNARD_AGENT_URL}/threads/${threadId}/history`, {
        method: 'POST',
        headers: authHeaders as any,
        body: JSON.stringify(request.body),
      });

      if (response.status === 404) {
        logger.info({ threadId }, 'Supressing 404 for new thread history');
        return reply.status(200).send([]);
      }

      const data = await response.json();
      return reply.status(response.status).send(data);
    } catch (error: any) {
      logger.error({ msg: 'History Proxy Error', error: error.message, threadId });
      return reply.status(502).send({ error: 'Upstream Error', message: error.message });
    }
  });

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
