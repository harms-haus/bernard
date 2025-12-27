import type { FastifyInstance } from 'fastify';
import { startOAuthLogin, type OAuthProvider } from '../lib/auth/oauth.js';
import { getAuthenticatedUser, requireAdmin, clearSessionCookie } from '../lib/auth/auth.js';
import { logger } from '../lib/logger.js';

export async function registerAuthRoutes(fastify: FastifyInstance) {
  // GET /auth/:provider/login - Proxy OAuth login to Next.js app
  fastify.get('/:provider/login', async (request, reply) => {
    const { provider } = request.params as { provider: string };

    if (!['github', 'google'].includes(provider)) {
      return reply.status(400).send({ error: 'Invalid provider' });
    }

    // Proxy to Next.js app
    const redirectUrl = `${request.protocol}://${request.hostname}/bernard/api/auth/${provider}/login${request.url.search}`;
    return reply.redirect(redirectUrl);
  });


  // GET /auth/me - Get current user info
  fastify.get('/me', async (request, reply) => {
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

  // POST /auth/logout - Clear session
  fastify.post('/logout', async (request, reply) => {
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

  // GET /auth/admin - Check admin status (for admin routes)
  fastify.get('/admin', async (request, reply) => {
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
}

