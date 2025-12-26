import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import axios from 'axios';
import { logger } from '../lib/logger.js';

const BERNARD_URL = process.env.BERNARD_URL || 'http://localhost:3000';
const VLLM_URL = process.env.VLLM_URL || 'http://localhost:8001';
const KOKORO_URL = process.env.KOKORO_URL || 'http://localhost:8003';
const WHISPER_URL = process.env.WHISPER_URL || 'http://localhost:8002';

export async function registerV1Routes(fastify: FastifyInstance) {
  // 1. Aggregated Models List
  fastify.get('/models', async (request, reply) => {
    const models: any[] = [];
    
    // Fetch from Bernard (Next.js)
    try {
      const resp = await axios.get(`${BERNARD_URL}/api/v1/models`, { timeout: 2000 });
      if (resp.data?.data) {
        models.push(...resp.data.data);
      }
    } catch (e) {
      logger.warn('Failed to fetch models from Bernard');
    }

    // Fetch from vLLM
    try {
      const resp = await axios.get(`${VLLM_URL}/v1/models`, { timeout: 2000 });
      if (resp.data?.data) {
        models.push(...resp.data.data);
      }
    } catch (e) {
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
      id: "kokoro-v1.0",
      object: "model",
      created: 1677649963,
      owned_by: "kokoro"
    });

    return { object: "list", data: models };
  });

  // 2. Chat Completions -> Next.js
  fastify.register(proxy, {
    upstream: `${BERNARD_URL}/api/v1`,
    prefix: '/chat/completions',
    rewritePrefix: '/chat/completions',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Chat)', error: error.message, upstream: BERNARD_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  // 3. Completions -> Next.js
  fastify.register(proxy, {
    upstream: `${BERNARD_URL}/api/v1`,
    prefix: '/completions',
    rewritePrefix: '/completions',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Completions)', error: error.message, upstream: BERNARD_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'bernard' });
    }
  } as any);

  // 4. Embeddings -> vLLM
  fastify.register(proxy, {
    upstream: VLLM_URL,
    prefix: '/embeddings',
    rewritePrefix: '/v1/embeddings',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Embeddings)', error: error.message, upstream: VLLM_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'vllm' });
    }
  } as any);

  // 5. Audio Transcriptions -> Whisper (TS implementation)
  fastify.register(proxy, {
    upstream: WHISPER_URL,
    prefix: '/audio/transcriptions',
    rewritePrefix: '/v1/audio/transcriptions',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Whisper)', error: error.message, upstream: WHISPER_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'whisper' });
    }
  } as any);

  // 6. Audio Speech -> Kokoro
  fastify.register(proxy, {
    upstream: KOKORO_URL,
    prefix: '/audio/speech',
    rewritePrefix: '/v1/audio/speech',
    http2: false,
    errorHandler: (reply: any, error: any) => {
      logger.error({ msg: 'Proxy Error (Speech)', error: error.message, upstream: KOKORO_URL });
      reply.status(502).send({ error: 'Upstream Error', message: error.message, service: 'kokoro' });
    }
  } as any);
}
