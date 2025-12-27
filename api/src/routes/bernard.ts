import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { logger } from '@/lib/logger'
import { startOAuthLogin, handleOAuthCallback, type OAuthProvider } from '@/lib/auth/oauth'
import { getAuthenticatedUser, requireAdmin, clearSessionCookie } from '@/lib/auth/auth'

const BERNARD_URL = process.env.BERNARD_URL || 'http://localhost:3001';
const BERNARD_API_URL = process.env.BERNARD_API_URL || 'http://localhost:3000';
const UI_URL = process.env.UI_URL || 'http://localhost:4200';

export async function registerBernardRoutes(fastify: FastifyInstance) {
  // 0. Register auth routes in a nested scope BEFORE proxy to ensure they match first
  // This ensures routes are registered in Fastify's route tree before the proxy plugin
  await fastify.register(async function (fastify) {
    fastify.get('/api/auth/:provider/login', async (request, reply) => {
      const { provider } = request.params as { provider: string };
      if (!['github', 'google'].includes(provider)) {
        return reply.status(400).send({ error: 'Invalid provider' });
      }
      logger.info({ provider, url: request.url }, 'Handling OAuth login');
      return startOAuthLogin(provider as OAuthProvider, request, reply);
    });

    fastify.get('/api/auth/:provider/callback', async (request, reply) => {
      const { provider } = request.params as { provider: string };
      if (!['github', 'google'].includes(provider)) {
        return reply.status(400).send({ error: 'Invalid provider' });
      }
      logger.info({ provider, url: request.url }, 'Handling OAuth callback');
      return handleOAuthCallback(provider as OAuthProvider, request, reply);
    });

    fastify.get('/api/auth/me', async (request, reply) => {
      try {
        logger.debug({ cookies: request.cookies, sessionCookie: request.cookies.bernard_session }, 'Auth me request');
        const authUser = await getAuthenticatedUser(request);
        logger.debug({ authUser: !!authUser }, 'Auth me result');
        if (!authUser) {
          return reply.status(401).send({ error: 'Not authenticated' });
        }
        return reply
          .header('Cache-Control', 'no-cache, no-store, must-revalidate')
          .header('Pragma', 'no-cache')
          .header('Expires', '0')
          .send({
            user: {
              id: authUser.user.id,
              displayName: authUser.user.displayName,
              isAdmin: authUser.user.isAdmin,
              status: authUser.user.status
            }
          });
      } catch (error) {
        logger.error({ error }, 'Failed to get user info');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    });

    fastify.post('/api/auth/logout', async (request, reply) => {
      try {
        return reply
          .status(200)
          .setCookie('bernard_session', '', {
            path: '/',
            maxAge: 0,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env['NODE_ENV'] === 'production'
          })
          .send({ success: true });
      } catch (error) {
        logger.error({ error }, 'Logout failed');
        return reply.status(500).send({ error: 'Logout failed' });
      }
    });

    fastify.get('/api/auth/admin', async (request, reply) => {
      try {
        const adminUser = await requireAdmin(request);
        if (!adminUser) {
          return reply.status(403).send({ error: 'Admin access required' });
        }
        return reply.send({
          user: {
            id: adminUser.user.id,
            displayName: adminUser.user.displayName,
            isAdmin: adminUser.user.isAdmin,
            status: adminUser.user.status
          }
        });
      } catch (error) {
        logger.error({ error }, 'Admin check failed');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    });
  });

  // 1. Settings proxy -> bernard-api
  fastify.register(proxy, {
    upstream: BERNARD_API_URL,
    prefix: '/settings',
    rewritePrefix: '/settings',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard API)', error: error.message, upstream: BERNARD_API_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-api' });
    }
  } as any);

  // 3. API proxy -> Next.js server /api routes (excluding /api/auth which is handled above)
  fastify.register(proxy, {
    upstream: BERNARD_URL,
    prefix: '/api',
    rewritePrefix: '/api',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard)', error: error.message, upstream: BERNARD_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  // 2. UI proxy -> Vite (everything else)
  fastify.register(proxy, {
    upstream: UI_URL,
    prefix: '/',
    rewritePrefix: '/bernard/',
    http2: false,
    websocket: true,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Bernard UI)', error: error.message, upstream: UI_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard-ui' });
    }
  } as any);
}

