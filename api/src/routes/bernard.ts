import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { logger } from '@/lib/logger'
import { startOAuthLogin, handleOAuthCallback, type OAuthProvider } from '@/lib/auth/oauth'
import { getAuthenticatedUser, requireAdmin } from '@/lib/auth/auth'

const BERNARD_URL = process.env.BERNARD_URL || 'http://localhost:3001';
const BERNARD_API_URL = process.env.BERNARD_API_URL || 'http://localhost:3000';
const UI_URL = process.env.UI_URL || 'http://localhost:4200';

export async function registerBernardRoutes(fastify: FastifyInstance) {
  // 1. Settings proxy -> bernard-api
  // NOTE: This is kept for any /settings calls that might exist, though /api/settings is preferred
  fastify.register(proxy, {
    upstream: BERNARD_API_URL,
    prefix: '/settings',
    rewritePrefix: '/settings',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Settings)', error: error.message, upstream: BERNARD_API_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-api' });
    }
  } as any);

  // 2. Central API proxy -> bernard-api
  // Handles /api/* (including /api/chat which bernard-api now proxies to the agent)
  fastify.register(proxy, {
    upstream: BERNARD_API_URL,
    prefix: '/api',
    rewritePrefix: '', // Strip /api prefix when sending to bernard-api
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (API)', error: error.message, upstream: BERNARD_API_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-api' });
    }
  } as any);

  // 3. UI proxy -> Vite (everything else)
  fastify.register(proxy, {
    upstream: UI_URL,
    prefix: '/',
    rewritePrefix: '/',
    http2: false,
    websocket: true,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (UI)', error: error.message, upstream: UI_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-ui' });
    }
  } as any);
}

