import crypto from "node:crypto";
import type Redis from "ioredis";

export type SessionRecord = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

const DEFAULT_NAMESPACE = "bernard:sessions";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export class SessionStore {
  private readonly namespace: string;
  private readonly ttlSeconds: number;

  constructor(private readonly redis: Redis, namespace = DEFAULT_NAMESPACE, ttlSeconds?: number) {
    this.namespace = namespace;
    this.ttlSeconds = ttlSeconds ?? Number(process.env["SESSION_TTL_SECONDS"] ?? DEFAULT_TTL_SECONDS);
  }

  private sessionKey(id: string) {
    return `${this.namespace}:id:${id}`;
  }

  private userSessionsKey(userId: string) {
    return `${this.namespace}:user:${userId}:sessions`;
  }

  async exportAll(userIds: string[]): Promise<SessionRecord[]> {
    const records: SessionRecord[] = [];
    for (const userId of userIds) {
      const sessionIds = await this.redis.smembers(this.userSessionsKey(userId));
      for (const id of sessionIds) {
        const data = await this.redis.hgetall(this.sessionKey(id));
        if (!data || !data["id"] || !data["userId"] || !data["expiresAt"]) continue;
        records.push({
          id: data["id"],
          userId: data["userId"],
          createdAt: data["createdAt"] ?? "",
          expiresAt: data["expiresAt"]
        });
      }
    }
    return records;
  }

  async create(userId: string): Promise<SessionRecord> {
    const id = crypto.randomBytes(18).toString("hex");
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000).toISOString();

    await this.redis
      .multi()
      .hset(this.sessionKey(id), { id, userId, createdAt, expiresAt })
      .sadd(this.userSessionsKey(userId), id)
      .exec();

    return { id, userId, createdAt, expiresAt };
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
      expiresAt: data["expiresAt"]
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
}

