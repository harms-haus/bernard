import { Redis } from "ioredis";

const globalForRedis = global as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    globalForRedis.redis = new Redis(url);
  }
  return globalForRedis.redis;
}

