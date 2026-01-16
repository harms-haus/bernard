import crypto from "node:crypto";
import type { Redis } from "ioredis";
import { ApiTokenRecord } from "./types";
import { getRedis } from "../infra";

const DEFAULT_NAMESPACE = "bernard:tokens";
const TOKEN_PREFIX = "brnd-";

export class TokenStore {
  private readonly namespace: string;

  constructor(private readonly redis: Redis, namespace = DEFAULT_NAMESPACE) {
    this.namespace = namespace;
  }

  private idKey(id: string) {
    return `${this.namespace}:id:${id}`;
  }

  private tokenKey(token: string) {
    return `${this.namespace}:secret:${token}`;
  }

  private nameKey(name: string) {
    return `${this.namespace}:name:${name}`;
  }

  private idsSet() {
    return `${this.namespace}:ids`;
  }

  async create(name: string, userId?: string): Promise<ApiTokenRecord> {
    const existingId = await this.redis.get(this.nameKey(name));
    if (existingId) {
      throw new Error(`Token name "${name}" already exists`);
    }

    const id = crypto.randomBytes(10).toString("hex");
    const token = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
    const createdAt = new Date().toISOString();
    const status = "active";

    const data: Record<string, string> = { id, name, token, createdAt, status };
    if (userId) data["userId"] = userId;

    await this.redis
      .multi()
      .hset(this.idKey(id), data)
      .set(this.nameKey(name), id)
      .set(this.tokenKey(token), id)
      .sadd(this.idsSet(), id)
      .exec();

    const result: ApiTokenRecord = { id, name, token, createdAt, status };
    if (userId) result.userId = userId;
    return result;
  }

  async get(id: string): Promise<ApiTokenRecord | null> {
    const data = await this.redis.hgetall(this.idKey(id));
    if (!data || !data["id"]) return null;

    const result: ApiTokenRecord = {
      id: data["id"],
      name: data["name"] || "",
      token: data["token"] || "",
      status: (data["status"] as "active" | "revoked") || "active",
      createdAt: data["createdAt"] || ""
    };

    if (data["lastUsedAt"]) result.lastUsedAt = data["lastUsedAt"];
    if (data["userId"]) result.userId = data["userId"];

    return result;
  }

  async update(id: string, updates: Partial<Pick<ApiTokenRecord, "name" | "status">>): Promise<ApiTokenRecord | null> {
    const current = await this.get(id);
    if (!current) return null;

    const multi = this.redis.multi();
    const data: Record<string, string> = {};

    if (updates.name && updates.name !== current.name) {
      const existingId = await this.redis.get(this.nameKey(updates.name));
      if (existingId) throw new Error(`Token name "${updates.name}" already exists`);

      multi.del(this.nameKey(current.name));
      multi.set(this.nameKey(updates.name), id);
      data["name"] = updates.name;
    }

    if (updates.status) {
      data["status"] = updates.status;
    }

    if (Object.keys(data).length > 0) {
      multi.hset(this.idKey(id), data);
      await multi.exec();
    }

    return this.get(id);
  }

  async resolve(token: string): Promise<ApiTokenRecord | null> {
    return this.validate(token);
  }

  async validate(token: string): Promise<ApiTokenRecord | null> {
    const id = await this.redis.get(this.tokenKey(token));
    if (!id) return null;
    const data = await this.get(id);
    if (!data || data.status !== "active") return null;

    const now = new Date().toISOString();
    await this.redis.hset(this.idKey(id), { lastUsedAt: now });

    return {
      ...data,
      lastUsedAt: now
    };
  }

  async delete(id: string): Promise<boolean> {
    const data = await this.get(id);
    if (!data) return false;

    await this.redis
      .multi()
      .del(this.idKey(id))
      .del(this.tokenKey(data.token))
      .del(this.nameKey(data.name))
      .srem(this.idsSet(), id)
      .exec();

    return true;
  }

  async exportAll(): Promise<ApiTokenRecord[]> {
    return this.list();
  }

  async list(): Promise<ApiTokenRecord[]> {
    const ids = await this.redis.smembers(this.idsSet());
    const tokens = await Promise.all(
      ids.map(async (id: string) => {
        return this.get(id);
      })
    );
    return tokens.filter((t: ApiTokenRecord | null): t is ApiTokenRecord => t !== null);
  }
}

export const getTokenStore = () => new TokenStore(getRedis());
