import { Redis } from "ioredis";

const globalForRedis = global as unknown as { redis?: Redis };

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
      console.error("[Redis] Connection error:", errorMessage || err);
    });

    // Log successful connection
    globalForRedis.redis.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    // Log when ready
    globalForRedis.redis.on("ready", () => {
      console.log("[Redis] Ready to accept commands");
    });
  }
  return globalForRedis.redis;
}

