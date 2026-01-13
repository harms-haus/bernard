import crypto from "node:crypto";
import type { Redis } from "ioredis";
import { SessionRecord } from "./types";

const DEFAULT_NAMESPACE = "bernard:sessions";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export class SessionStore {
  private readonly namespace: string;
  private readonly ttlSeconds: number;

  constructor(private readonly redis: Redis, namespace = DEFAULT_NAMESPACE, ttlSeconds?: number) {
    this.namespace = namespace;
    this.ttlSeconds = ttlSeconds ?? 60 * 60 * 24 * 7;
  }

  private sessionKey(id: string) {
    return `${this.namespace}:id:${id}`;
  }

  private userSessionsKey(userId: string) {
    return `${this.namespace}:user:${userId}:sessions`;
  }

  async create(userId: string, metadata: { userAgent?: string; ipAddress?: string } = {}): Promise<SessionRecord> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000).toISOString();

    const data: Record<string, string> = { id, userId, createdAt, expiresAt };
    if (metadata.userAgent) data["userAgent"] = metadata.userAgent;
    if (metadata.ipAddress) data["ipAddress"] = metadata.ipAddress;

    await this.redis
      .multi()
      .hset(this.sessionKey(id), data)
      .sadd(this.userSessionsKey(userId), id)
      .expire(this.sessionKey(id), this.ttlSeconds)
      .exec();

    return { id, userId, createdAt, expiresAt, ...metadata };
  }

  async get(id: string): Promise<SessionRecord | null> {
    const data = await this.redis.hgetall(this.sessionKey(id));
    if (!data || !data["id"] || !data["userId"] || !data["expiresAt"]) return null;

    const expiresAt = new Date(data["expiresAt"]).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      await this.delete(id, data["userId"]);
      return null;
    }

    return {
      id: data["id"],
      userId: data["userId"],
      createdAt: data["createdAt"] ?? "",
      expiresAt: data["expiresAt"],
      userAgent: data["userAgent"],
      ipAddress: data["ipAddress"]
    };
  }

  async delete(id: string, userId?: string): Promise<void> {
    const knownUser = userId ?? (await this.redis.hget(this.sessionKey(id), "userId"));
    const multi = this.redis.multi().del(this.sessionKey(id));
    if (knownUser) {
      multi.srem(this.userSessionsKey(knownUser), id);
    }
    await multi.exec();
  }

  async deleteForUser(userId: string): Promise<void> {
    const sessionIds = await this.redis.smembers(this.userSessionsKey(userId));
    const multi = this.redis.multi();
    for (const sid of sessionIds) {
      multi.del(this.sessionKey(sid));
      multi.srem(this.userSessionsKey(userId), sid);
    }
    await multi.exec();
  }

  async listAll(): Promise<SessionRecord[]> {
    const keys = await this.redis.keys(`${this.namespace}:id:*`);
    const sessions = await Promise.all(
      keys.map(async (key: string) => {
        const id = key.split(":").pop();
        return id ? this.get(id) : null;
      })
    );
    return sessions.filter((s: SessionRecord | null): s is SessionRecord => s !== null);
  }

  async exportAll(): Promise<SessionRecord[]> {
    return this.listAll();
  }
}

