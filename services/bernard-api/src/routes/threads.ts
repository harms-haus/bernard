import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Redis from "ioredis";

const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";

interface ThreadListItem {
  id: string;
  name?: string;
  createdAt: string;
  lastTouchedAt: string;
  messageCount?: number;
}

function getRedis(): Redis {
  return new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
}

const CHECKPOINT_PATTERNS = [
  /^checkpoints:([^:]+):([^:]+)$/,
  /^checkpoint:([^:]+):([^:]+)$/,
  /^langgraph:checkpoints:([^:]+):([^:]+)$/,
];

function parseCheckpointKey(key: string): { threadId: string; checkpointId: string } | null {
  for (const pattern of CHECKPOINT_PATTERNS) {
    const match = key.match(pattern);
    if (match) {
      return { threadId: match[1], checkpointId: match[2] };
    }
  }
  return null;
}

export function registerThreadsRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/threads", async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    try {
      const redis = getRedis();
      await redis.connect();

      const limit = parseInt(request.query.limit || "50", 10);
      const offset = parseInt(request.query.offset || "0", 10);
      const checkpointKeys = new Set<string>();
      let cursor = "0";

      do {
        const [newCursor, keys] = await redis.scan(cursor, "MATCH", "*checkpoints*", "COUNT", 100);
        cursor = newCursor;
        for (const key of keys) {
          checkpointKeys.add(key);
        }
      } while (cursor !== "0" && checkpointKeys.size < limit + offset + 100);

      const threadMap = new Map<string, { name?: string; createdAt: string; lastTouchedAt: string; checkpointIds: Set<string> }>();

      for (const key of checkpointKeys) {
        const parsed = parseCheckpointKey(key);
        if (parsed) {
          const { threadId, checkpointId } = parsed;

          if (!threadMap.has(threadId)) {
            threadMap.set(threadId, {
              name: undefined,
              createdAt: new Date().toISOString(),
              lastTouchedAt: new Date().toISOString(),
              checkpointIds: new Set(),
            });
          }
          const thread = threadMap.get(threadId)!;
          thread.checkpointIds.add(checkpointId);

          if (checkpointId.length >= 8) {
            const timestamp = parseInt(checkpointId.substring(0, 8), 16) * 1000;
            if (!isNaN(timestamp)) {
              const checkpointTime = new Date(timestamp);
              thread.lastTouchedAt = checkpointTime.toISOString();
              if (!thread.createdAt || checkpointTime < new Date(thread.createdAt)) {
                thread.createdAt = checkpointTime.toISOString();
              }
            }
          }
        }
      }

      const threadMetadataKeys = new Set<string>();
      cursor = "0";
      do {
        const [newCursor, keys] = await redis.scan(cursor, "MATCH", "bernard:thread:*", "COUNT", 100);
        cursor = newCursor;
        for (const key of keys) {
          threadMetadataKeys.add(key);
        }
      } while (cursor !== "0");

      for (const key of threadMetadataKeys) {
        try {
          const data = await redis.get(key);
          if (data) {
            const parsed = JSON.parse(data) as { name?: string };
            if (parsed.name) {
              const threadId = key.split(":").pop();
              if (threadId && threadMap.has(threadId)) {
                threadMap.get(threadId)!.name = parsed.name;
              }
            }
          }
        } catch (e) {
          void e;
        }
      }

      await redis.quit();

      const threads: ThreadListItem[] = Array.from(threadMap.entries())
        .map(([id, data]) => ({
          id,
          name: data.name,
          createdAt: data.createdAt,
          lastTouchedAt: data.lastTouchedAt,
          messageCount: data.checkpointIds.size,
        }))
        .sort((a, b) => new Date(b.lastTouchedAt).getTime() - new Date(a.lastTouchedAt).getTime());

      const paginatedThreads = threads.slice(offset, offset + limit);

      return reply.send({
        threads: paginatedThreads,
        total: threads.length,
        hasMore: offset + limit < threads.length,
      });
    } catch (error) {
      fastify.log.error({ error }, "Failed to list threads");
      return reply.status(500).send({
        error: "Failed to list threads",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  fastify.get<{ Params: { threadId: string } }>("/threads/:threadId", async (
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { threadId } = request.params;
      const redis = getRedis();
      await redis.connect();

      const checkpoints: Array<{ id: string; timestamp: string }> = [];
      let cursor = "0";

      do {
        const [newCursor, keys] = await redis.scan(cursor, "MATCH", `*checkpoints*${threadId}*`, "COUNT", 50);
        cursor = newCursor;
        for (const key of keys) {
          const parsed = parseCheckpointKey(key);
          if (parsed && parsed.threadId === threadId) {
            const timestamp = parsed.checkpointId.length >= 8
              ? (() => {
                  try {
                    const ts = parseInt(parsed.checkpointId.substring(0, 8), 16) * 1000;
                    return isNaN(ts) ? new Date().toISOString() : new Date(ts).toISOString();
                  } catch {
                    return new Date().toISOString();
                  }
                })()
              : new Date().toISOString();
            checkpoints.push({ id: parsed.checkpointId, timestamp });
          }
        }
      } while (cursor !== "0");

      await redis.quit();

      if (checkpoints.length === 0) {
        return reply.status(404).send({ error: "Thread not found" });
      }

      return reply.send({
        id: threadId,
        checkpoints: checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
        checkpointCount: checkpoints.length,
      });
    } catch (error) {
      fastify.log.error({ error }, "Failed to get thread");
      return reply.status(500).send({
        error: "Failed to get thread",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  fastify.patch<{ Params: { threadId: string }; Body: { name?: string } }>("/threads/:threadId", async (
    request: FastifyRequest<{ Params: { threadId: string }; Body: { name?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { threadId } = request.params;
      const { name } = request.body;

      if (!name) {
        return reply.status(400).send({ error: "Name is required" });
      }

      const redis = getRedis();
      await redis.connect();
      await redis.set(`bernard:thread:${threadId}`, JSON.stringify({ name, updatedAt: new Date().toISOString() }));
      await redis.quit();

      return reply.send({ id: threadId, name, updated: true });
    } catch (error) {
      fastify.log.error({ error }, "Failed to update thread");
      return reply.status(500).send({
        error: "Failed to update thread",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  fastify.delete<{ Params: { threadId: string } }>("/threads/:threadId", async (
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { threadId } = request.params;
      const redis = getRedis();
      await redis.connect();

      let cursor = "0";
      let deletedCount = 0;

      do {
        const [newCursor, keys] = await redis.scan(cursor, "MATCH", `*checkpoints*${threadId}*`, "COUNT", 100);
        cursor = newCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== "0");

      await redis.del(`bernard:thread:${threadId}`);
      await redis.quit();

      return reply.send({ id: threadId, deletedCheckpoints: deletedCount, deleted: true });
    } catch (error) {
      fastify.log.error({ error }, "Failed to delete thread");
      return reply.status(500).send({
        error: "Failed to delete thread",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
