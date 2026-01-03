import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

let redisCheckpointer: RedisSaver | null = null;

/**
 * Get the Redis checkpointer singleton instance.
 * Uses lazy initialization to avoid startup failures if Redis is unavailable.
 */
export async function getRedisCheckpointer(): Promise<RedisSaver> {
  if (!redisCheckpointer) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    redisCheckpointer = await RedisSaver.fromUrl(url);
  }
  return redisCheckpointer;
}

/**
 * Close the Redis checkpointer connection gracefully.
 * Should be called during application shutdown.
 */
export async function closeRedisCheckpointer(): Promise<void> {
  if (redisCheckpointer) {
    await redisCheckpointer.end();
    redisCheckpointer = null;
  }
}
