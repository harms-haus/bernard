import crypto from "node:crypto";
import type Redis from "ioredis";

export type TokenStatus = "active" | "disabled";

export type TokenInfo = {
  id: string;
  name: string;
  status: TokenStatus;
  createdAt: string;
  lastUsedAt?: string;
};

export type TokenRecord = TokenInfo & { token: string };

const DEFAULT_NAMESPACE = "bernard:tokens";

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

  async create(name: string): Promise<TokenRecord> {
    const existingId = await this.redis.get(this.nameKey(name));
    if (existingId) {
      throw new Error(`Token name "${name}" already exists`);
    }

    const id = crypto.randomBytes(10).toString("hex");
    const token = crypto.randomBytes(24).toString("hex");
    const createdAt = new Date().toISOString();

    await this.redis
      .multi()
      .hset(this.idKey(id), {
        id,
        name,
        token,
        createdAt,
        status: "active"
      })
      .set(this.nameKey(name), id)
      .set(this.tokenKey(token), id)
      .sadd(this.idsSet(), id)
      .exec();

    return { id, name, token, status: "active", createdAt };
  }

  async validate(token: string): Promise<TokenInfo | null> {
    const id = await this.redis.get(this.tokenKey(token));
    if (!id) return null;
    const data = await this.redis.hgetall(this.idKey(id));
    if (!data || !data["id"] || data["status"] === "disabled") return null;

    const now = new Date().toISOString();
    await this.redis.hset(this.idKey(id), { lastUsedAt: now });

    const name = data["name"];
    const createdAt = data["createdAt"];
    if (!name || !createdAt) return null;

    return {
      id,
      name,
      status: (data["status"] as TokenStatus) ?? "active",
      createdAt,
      lastUsedAt: now
    };
  }

  async get(id: string): Promise<TokenInfo | null> {
    const data = await this.redis.hgetall(this.idKey(id));
    if (!data || !data["id"]) return null;
    const name = data["name"];
    const createdAt = data["createdAt"];
    if (!name || !createdAt) return null;
    const token: TokenInfo = {
      id,
      name,
      status: (data["status"] as TokenStatus) ?? "active",
      createdAt
    };
    const lastUsedAt = data["lastUsedAt"];
    if (lastUsedAt) token.lastUsedAt = lastUsedAt;
    return token;
  }

  async update(id: string, updates: { name?: string; status?: TokenStatus }): Promise<TokenInfo | null> {
    const current = await this.redis.hgetall(this.idKey(id));
    if (!current || !current["id"]) return null;
    const currentName = current["name"];
    const currentStatus = (current["status"] as TokenStatus) ?? "active";
    const currentCreatedAt = current["createdAt"];
    if (!currentName || !currentCreatedAt) return null;

    const rename = updates.name && updates.name !== currentName ? updates.name : undefined;
    if (rename) {
      const conflictId = await this.redis.get(this.nameKey(rename));
      if (conflictId && conflictId !== id) {
        throw new Error(`Token name "${rename}" already exists`);
      }
    }

    const multi = this.redis.multi();
    if (rename) {
      multi.del(this.nameKey(currentName));
      multi.set(this.nameKey(rename), id);
      multi.hset(this.idKey(id), { name: rename });
    }

    if (updates.status) {
      multi.hset(this.idKey(id), { status: updates.status });
    }

    await multi.exec();
    const token: TokenInfo = {
      id,
      name: rename ?? currentName,
      status: updates.status ?? currentStatus,
      createdAt: currentCreatedAt
    };
    if (current["lastUsedAt"]) {
      token.lastUsedAt = current["lastUsedAt"];
    }
    return token;
  }

  async delete(id: string): Promise<boolean> {
    const data = await this.redis.hgetall(this.idKey(id));
    if (!data || !data["id"] || !data["token"] || !data["name"]) return false;

    await this.redis
      .multi()
      .del(this.idKey(id))
      .del(this.tokenKey(data["token"]))
      .del(this.nameKey(data["name"]))
      .srem(this.idsSet(), id)
      .exec();

    return true;
  }

  async list(): Promise<TokenInfo[]> {
    const ids = await this.redis.smembers(this.idsSet());
    const tokens: Array<TokenInfo | null> = await Promise.all(
      ids.map(async (id) => {
        const data = await this.redis.hgetall(this.idKey(id));
        if (!data || !data["id"]) return null;
        const name = data["name"];
        const createdAt = data["createdAt"];
        if (!name || !createdAt) return null;
        const token: TokenInfo = {
          id,
          name,
          status: (data["status"] as TokenStatus) ?? "active",
          createdAt
        };
        if (data["lastUsedAt"]) token.lastUsedAt = data["lastUsedAt"];
        return token satisfies TokenInfo;
      })
    );

    return tokens.filter((t): t is TokenInfo => t !== null);
  }
}

