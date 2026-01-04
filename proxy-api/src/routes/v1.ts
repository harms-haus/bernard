import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import proxy from '@fastify/http-proxy';
import axios from 'axios';
import { logger } from '@/lib/logger'
import { getAuthenticatedUser } from '@/lib/auth/auth'

const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';
const VLLM_URL = process.env.VLLM_URL || 'http://127.0.0.1:8860';
const KOKORO_URL = process.env.KOKORO_URL || 'http://127.0.0.1:8880';
const WHISPER_URL = process.env.WHISPER_URL || 'http://127.0.0.1:8870';

function passThroughAuth(req: FastifyRequest, headers: Record<string, string>) {
  const authHeader = req.headers.authorization;
  const cookie = req.headers.cookie;
  return {
    ...headers,
    ...(authHeader ? { authorization: authHeader } : {}),
    ...(cookie ? { cookie } : {})
  };
}

export async function registerV1Routes(fastify: FastifyInstance) {
  // 1. Aggregated Models List (requires session auth)
  fastify.get('/models', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const models: any[] = [];
    
    // Fetch from Bernard Agent
    try {
      const resp = await axios.get(`${BERNARD_AGENT_URL}/v1/models`, { timeout: 2000 });
      if (resp.data?.data) {
        models.push(...resp.data.data);
      }
    } catch {
      logger.warn('Failed to fetch models from Bernard Agent');
    }

    // Fetch from vLLM
    try {
      const resp = await axios.get(`${VLLM_URL}/v1/models`, { timeout: 2000 });
      if (resp.data?.data) {
        models.push(...resp.data.data);
      }
    } catch {
      logger.warn('Failed to fetch models from vLLM');
    }

    // Static Audio Models
    models.push({
      id: "whisper-1",
      object: "model",
      created: 1677649963,
      owned_by: "openai"
    });
    models.push({
      id: "tts-1",
      object: "model",
      created: 1677649963,
      owned_by: "openai"
    });

    return { object: "list", data: models };
  });

  // 2. Chat Completions -> Bernard Agent
  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/chat/completions',
    rewritePrefix: '/v1/chat/completions',
    http2: false,
    disableContentHandling: true,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Chat)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  // 3. Embeddings -> vLLM
  fastify.register(proxy, {
    upstream: VLLM_URL,
    prefix: '/embeddings',
    rewritePrefix: '/v1/embeddings',
    http2: false,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Embeddings)', error: error.message, upstream: VLLM_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'vllm' });
    }
  } as any);

  // 4. Audio Transcriptions -> Whisper.cpp
  fastify.register(proxy, {
    upstream: WHISPER_URL,
    prefix: '/audio/transcriptions',
    rewritePrefix: '/inference',
    http2: false,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Whisper)', error: error.message, upstream: WHISPER_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'whisper' });
    }
  } as any);

  // 5. Audio Speech -> Kokoro
  fastify.register(proxy, {
    upstream: KOKORO_URL,
    prefix: '/audio/speech',
    rewritePrefix: '/v1/audio/speech',
    http2: false,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Speech)', error: error.message, upstream: KOKORO_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'kokoro' });
    }
  } as any);

  // 6. LangGraph SDK: Threads and Runs -> Bernard Agent
  // Use a wildcard prefix to capture all thread-related paths
  fastify.register(proxy, {
    upstream: BERNARD_AGENT_URL,
    prefix: '/threads',
    rewritePrefix: '/threads',
    http2: false,
    rewriteRequestHeaders: passThroughAuth,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Threads)', error: error.message, upstream: BERNARD_AGENT_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);
}
