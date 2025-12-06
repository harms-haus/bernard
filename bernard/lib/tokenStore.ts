import crypto from "node:crypto";
import type Redis from "ioredis";

export type TokenMetadata = {
  name: string;
  createdAt: string;
  createdBy?: string;
  note?: string;
};

export type TokenRecord = TokenMetadata & { token: string };

const DEFAULT_NAMESPACE = "bernard:tokens";

export class TokenStore {
  private readonly namespace: string;

  constructor(private readonly redis: Redis, namespace = DEFAULT_NAMESPACE) {
    this.namespace = namespace;
  }

  private nameKey(name: string) {
    return `${this.namespace}:name:${name}`;
  }

  private tokenKey(token: string) {
    return `${this.namespace}:token:${token}`;
  }

  private namesSet() {
    return `${this.namespace}:names`;
  }

  async create(
    name: string,
    opts: { createdBy?: string; note?: string } = {}
  ): Promise<TokenRecord> {
    const exists = await this.redis.exists(this.nameKey(name));
    if (exists) {
      throw new Error(`Token name "${name}" already exists`);
    }

    const token = crypto.randomBytes(24).toString("hex");
    const createdAt = new Date().toISOString();
    const record: TokenRecord = {
      name,
      token,
      createdAt,
      createdBy: opts.createdBy,
      note: opts.note
    };

    await this.redis
      .multi()
      .hset(this.nameKey(name), {
        token,
        createdAt,
        createdBy: opts.createdBy ?? "",
        note: opts.note ?? ""
      })
      .set(this.tokenKey(token), name)
      .sadd(this.namesSet(), name)
      .exec();

    return record;
  }

  async validate(token: string): Promise<TokenMetadata | null> {
    const name = await this.redis.get(this.tokenKey(token));
    if (!name) return null;
    const meta = await this.redis.hgetall(this.nameKey(name));
    if (!meta || !meta.createdAt) return null;
    return {
      name,
      createdAt: meta.createdAt,
      createdBy: meta.createdBy || undefined,
      note: meta.note || undefined
    };
  }

  async delete(name: string): Promise<boolean> {
    const meta = await this.redis.hgetall(this.nameKey(name));
    if (!meta || !meta.token) return false;
    const res = await this.redis
      .multi()
      .del(this.nameKey(name))
      .del(this.tokenKey(meta.token))
      .srem(this.namesSet(), name)
      .exec();

    return (res ?? []).every((item) => {
      if (!Array.isArray(item)) return false;
      const [, value] = item;
      return typeof value === "number" ? value >= 0 : true;
    });
  }

  async list(): Promise<TokenMetadata[]> {
    const names = await this.redis.smembers(this.namesSet());
    const metas: Array<TokenMetadata | null> = await Promise.all(
      names.map(async (name) => {
        const meta = await this.redis.hgetall(this.nameKey(name));
        if (!meta || !meta.createdAt) return null;
        return {
          name,
          createdAt: meta.createdAt,
          createdBy: meta.createdBy || undefined,
          note: meta.note || undefined
        } satisfies TokenMetadata;
      })
    );

    return metas.filter((m): m is TokenMetadata => m !== null);
  }
}

