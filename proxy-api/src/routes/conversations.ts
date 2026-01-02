import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuthenticatedUser, requireAdmin } from '@/lib/auth/auth';
import axios from 'axios';
import { logger } from '@/lib/logger';

const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:8850';

interface ConversationParams {
  id: string;
}

interface ListQuerystring {
  archived?: string;
  limit?: string;
  offset?: string;
}

function isAdminUser(user: { isAdmin?: boolean } | undefined): boolean {
  return user?.isAdmin === true;
}

export async function registerConversationRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: ConversationParams }>(
    '/conversations/:id',
    async (request: FastifyRequest<{ Params: ConversationParams }>, reply: FastifyReply) => {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { id: conversationId } = request.params;

      try {
        const response = await axios.get(
          `${BERNARD_AGENT_URL}/api/conversations/${conversationId}`,
          {
            headers: {
              Authorization: request.headers.authorization,
              Cookie: request.headers.cookie
            }
          }
        );

        const { conversation, events } = response.data;

        if (conversation.userId !== authUser.user.id && !isAdminUser(authUser.user)) {
          return reply.status(403).send({ error: 'Access denied' });
        }

        return { conversation, events };
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          return reply.status(403).send({ error: 'Access denied' });
        }
        logger.error({ error }, 'Failed to fetch conversation');
        throw error;
      }
    }
  );

  fastify.get<{ Querystring: ListQuerystring }>(
    '/conversations',
    async (request: FastifyRequest<{ Querystring: ListQuerystring }>, reply: FastifyReply) => {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { archived, limit, offset } = request.query;
      const includeArchived = archived === 'true';
      const limitNum = parseInt(limit || '50', 10);
      const offsetNum = parseInt(offset || '0', 10);

      try {
        const response = await axios.get(
          `${BERNARD_AGENT_URL}/api/conversations`,
          {
            headers: {
              Authorization: request.headers.authorization,
              Cookie: request.headers.cookie
            },
            params: {
              archived: includeArchived,
              limit: limitNum,
              offset: offsetNum
            }
          }
        );

        return response.data;
      } catch (error) {
        logger.error({ error }, 'Failed to list conversations');
        throw error;
      }
    }
  );

  fastify.post<{ Params: ConversationParams }>(
    '/conversations/:id/archive',
    async (request: FastifyRequest<{ Params: ConversationParams }>, reply: FastifyReply) => {
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { id: conversationId } = request.params;

      try {
        const convResponse = await axios.get(
          `${BERNARD_AGENT_URL}/api/conversations/${conversationId}`,
          {
            headers: {
              Authorization: request.headers.authorization,
              Cookie: request.headers.cookie
            }
          }
        );

        const { conversation } = convResponse.data;

        if (conversation.userId !== authUser.user.id && !isAdminUser(authUser.user)) {
          return reply.status(403).send({ error: 'Access denied' });
        }

        await axios.post(
          `${BERNARD_AGENT_URL}/api/conversations/${conversationId}/archive`,
          {},
          {
            headers: {
              Authorization: request.headers.authorization,
              Cookie: request.headers.cookie
            }
          }
        );

        return {
          success: true,
          archivedAt: new Date().toISOString()
        };
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          return reply.status(403).send({ error: 'Access denied' });
        }
        logger.error({ error }, 'Failed to archive conversation');
        throw error;
      }
    }
  );

  fastify.delete<{ Params: ConversationParams }>(
    '/conversations/:id',
    async (request: FastifyRequest<{ Params: ConversationParams }>, reply: FastifyReply) => {
      const adminUser = await requireAdmin(request);
      if (!adminUser) {
        return reply.status(403).send({ error: 'Admin access required' });
      }

      const { id: conversationId } = request.params;

      try {
        await axios.delete(
          `${BERNARD_AGENT_URL}/api/conversations/${conversationId}`,
          {
            headers: {
              Authorization: request.headers.authorization,
              Cookie: request.headers.cookie
            }
          }
        );

        return { success: true };
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }
        logger.error({ error }, 'Failed to delete conversation');
        throw error;
      }
    }
  );

  // GET /conversations/all - Admin only, list all conversations across all users
  fastify.get<{ Querystring: ListQuerystring }>(
    '/conversations/all',
    async (request: FastifyRequest<{ Querystring: ListQuerystring }>, reply: FastifyReply) => {
      const adminUser = await requireAdmin(request);
      if (!adminUser) {
        return reply.status(403).send({ error: 'Admin access required' });
      }

      const { archived, limit, offset } = request.query;
      const includeArchived = archived === 'true';
      const limitNum = parseInt(limit || '50', 10);
      const offsetNum = parseInt(offset || '0', 10);

      try {
        const response = await axios.get(
          `${BERNARD_AGENT_URL}/api/conversations/all`,
          {
            headers: {
              Authorization: request.headers.authorization,
              Cookie: request.headers.cookie
            },
            params: {
              archived: includeArchived,
              limit: limitNum,
              offset: offsetNum
            }
          }
        );

        return response.data;
      } catch (error) {
        logger.error({ error }, 'Failed to list all conversations');
        throw error;
      }
    }
  );
}
