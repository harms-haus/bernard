import { Redis } from "ioredis";
import { logger } from '@/lib/logging/logger';

const globalForRedis = global as unknown as { redis?: Redis; bullmqRedis?: Redis };

export function retryStrategy(times: number): number {
  // Linear backoff with cap at 5 seconds
  const delay = Math.min(times * 200, 5000);
  return delay;
}

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    globalForRedis.redis = new Redis(url, {
      retryStrategy,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true, // Don't connect until actually needed - prevents startup errors
    });

    // Handle connection errors gracefully - don't crash the app
    globalForRedis.redis.on("error", (err: unknown) => {
      // Check if it's an AggregateError (common for connection failures)
      if (err && typeof err === "object" && "name" in err && err.name === "AggregateError") {
        // AggregateError during startup is expected - silently ignore
        // Redis will retry automatically via retryStrategy
        return;
      }
      
      // Check for ECONNREFUSED errors (expected during startup)
      const error = err as Error & { code?: string; message?: string };
      const errorMessage = error?.message || String(err);
      const errorCode = error?.code || "";
      
      if (
        errorCode === "ECONNREFUSED" ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("connect")
      ) {
        // Silently ignore - Redis will retry automatically
        return;
      }
      
      // Log other unexpected errors
      logger.error({ error: errorMessage || err }, 'Redis connection error');
    });

    // Log successful connection
    globalForRedis.redis.on("connect", () => {
      logger.info('Redis connected');
    });

    // Log when ready
    globalForRedis.redis.on("ready", () => {
      logger.info('Redis ready to accept commands');
    });
  }
  return globalForRedis.redis;
}

/**
 * Get a Redis connection optimized for BullMQ.
 *
 * BullMQ requires maxRetriesPerRequest to be null because it handles
 * its own retry logic. Sharing a Redis connection with maxRetriesPerRequest
 * set to a number causes BullMQ to throw an error.
 */
export function getBullMQRedis(): Redis {
  if (!globalForRedis.bullmqRedis) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    globalForRedis.bullmqRedis = new Redis(url, {
      retryStrategy,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: true,
      lazyConnect: true,
    });

    // Share the same error handling logic
    globalForRedis.bullmqRedis.on("error", (err: unknown) => {
      if (err && typeof err === "object" && "name" in err && err.name === "AggregateError") {
        return;
      }

      const error = err as Error & { code?: string; message?: string };
      const errorMessage = error?.message || String(err);
      const errorCode = error?.code || "";

      if (
        errorCode === "ECONNREFUSED" ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("connect")
      ) {
        return;
      }

      logger.error({ error: errorMessage || err }, 'BullMQ Redis connection error');
    });

    globalForRedis.bullmqRedis.on("connect", () => {
      logger.info('BullMQ Redis connected');
    });

    globalForRedis.bullmqRedis.on("ready", () => {
      logger.info('BullMQ Redis ready to accept commands');
    });
  }
  return globalForRedis.bullmqRedis;
}

