import { createAdapterFactory, type CustomAdapter, type CleanedWhere, type AdapterFactoryCustomizeAdapterCreator } from "@better-auth/core/db/adapter";
import type { BetterAuthDBSchema, BetterAuthOptions } from "better-auth";
import type { Redis } from "ioredis";

interface RedisAdapterConfig {
  client: Redis;
  keyPrefix?: string;
}

function makeKey(prefix: string, model: string, id: string): string {
  return `${prefix}${model}:${id}`;
}

function transformUserData(data: Record<string, string>) {
  if (!data || Object.keys(data).length === 0) {
    return null;
  }
  return {
    id: data.id,
    email: data.email,
    emailVerified: data.emailVerified === "true",
    name: data.name,
    image: data.image || null,
    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    banned: data.banned === "true",
    isAdmin: data.role === "admin",
    role: data.role || "user",
  };
}

function createRedisAdapter(client: Redis, keyPrefix: string): CustomAdapter {
  function convertWhere(where: CleanedWhere[], data: Record<string, string>): boolean {
    return where.every((w) => {
      const value = data[w.field];
      const wvalue = String(w.value);
      switch (w.operator) {
        case undefined:
        case "eq":
          return value === wvalue;
        case "ne":
          return value !== wvalue;
        case "gt":
          return Number(value) > Number(wvalue);
        case "gte":
          return Number(value) >= Number(wvalue);
        case "lt":
          return Number(value) < Number(wvalue);
        case "lte":
          return Number(value) <= Number(wvalue);
        case "in":
          return Array.isArray(w.value) && (w.value as string[]).includes(value);
        case "not_in":
          return Array.isArray(w.value) && !(w.value as string[]).includes(value);
        case "contains":
          return String(value).includes(wvalue);
        case "starts_with":
          return String(value).startsWith(wvalue);
        case "ends_with":
          return String(value).endsWith(wvalue);
        default:
          return value === wvalue;
      }
    });
  }

  return {
    async create<T extends Record<string, any>>({ model, data }: { model: string; data: T }) {
      const id = String(data.id || crypto.randomUUID());
      const key = makeKey(keyPrefix, model, id);

      const stringData: Record<string, string> = {};
      const dataRecord = data as Record<string, unknown>;
      for (const [k, v] of Object.entries(dataRecord)) {
        if (v !== null && v !== undefined) {
          stringData[k] = String(v);
        }
      }
      await client.hset(key, stringData);

      if (model === "user" && data.email) {
        await client.set(`${keyPrefix}email:${data.email}`, id);
      }

      return { id, ...data } as T;
    },

    async findOne<T>({
      model,
      where,
    }: {
      model: string;
      where: CleanedWhere[];
      select?: string[];
    }): Promise<T | null> {
      if (where.length === 1 && where[0].field === "id" && where[0].operator === "eq") {
        const key = makeKey(keyPrefix, model, String(where[0].value));
        const data = await client.hgetall(key);
        if (Object.keys(data).length === 0) return null;

        if (model === "user") {
          return transformUserData(data) as T;
        }
        return data as T;
      }

      if (where.length === 1 && where[0].field === "email" && where[0].operator === "eq" && model === "user") {
        const id = await client.get(`${keyPrefix}email:${String(where[0].value)}`);
        if (!id) return null;
        const key = makeKey(keyPrefix, model, id);
        const data = await client.hgetall(key);
        if (Object.keys(data).length === 0) return null;
        return transformUserData(data) as T;
      }

      const pattern = makeKey(keyPrefix, model, "*");
      const keys = await client.keys(pattern);

      for (const key of keys) {
        const data = await client.hgetall(key);
        if (convertWhere(where, data)) {
          if (model === "user") {
            return transformUserData(data) as T;
          }
          return data as T;
        }
      }

      return null;
    },

    async findMany<T>({
      model,
      where,
      limit = 100,
      offset = 0
    }: {
      model: string;
      where?: CleanedWhere[];
      limit: number;
      offset?: number;
    }): Promise<T[]> {
      const pattern = makeKey(keyPrefix, model, "*");
      const keys = await client.keys(pattern);
      const results: T[] = [];

      for (const key of keys.slice(offset, offset + limit)) {
        const data = await client.hgetall(key);
        if (!where || where.length === 0) {
          results.push((model === "user" ? transformUserData(data) : data) as T);
        } else if (convertWhere(where, data)) {
          results.push((model === "user" ? transformUserData(data) : data) as T);
        }
      }

      return results;
    },

    async count({
      model,
      where
    }: {
      model: string;
      where?: CleanedWhere[];
    }): Promise<number> {
      const pattern = makeKey(keyPrefix, model, "*");
      const keys = await client.keys(pattern);

      if (!where || where.length === 0) {
        return keys.length;
      }

      let cnt = 0;
      for (const key of keys) {
        const data = await client.hgetall(key);
        if (convertWhere(where, data)) {
          cnt++;
        }
      }

      return cnt;
    },

    async update<T>({
      model,
      where,
      update: values
    }: {
      model: string;
      where: CleanedWhere[];
      update: T;
    }): Promise<T | null> {
      const result = await this.findOne({ model, where });
      if (!result || !((result as Record<string, unknown>).id)) return null;

      const resultId = String((result as Record<string, unknown>).id);
      const key = makeKey(keyPrefix, model, resultId);

      const stringData: Record<string, string> = {};
      const valuesRecord = values as Record<string, unknown>;
      for (const [k, v] of Object.entries(valuesRecord)) {
        if (v !== null && v !== undefined) {
          stringData[k] = String(v);
        }
      }
      await client.hset(key, stringData);

      if (model === "user" && "email" in valuesRecord) {
        const oldEmail = (result as Record<string, unknown>).email;
        const newEmail = valuesRecord.email;
        if (oldEmail && newEmail && String(oldEmail) !== String(newEmail)) {
          await client.set(`${keyPrefix}email:${String(newEmail)}`, resultId);
          await client.del(`${keyPrefix}email:${String(oldEmail)}`);
        }
      }

      return { ...result, ...values } as T;
    },

    async updateMany({
      model,
      where,
      update: values
    }: {
      model: string;
      where: CleanedWhere[];
      update: Record<string, unknown>;
    }): Promise<number> {
      const results = await this.findMany({ model, where, limit: 1000 });
      let cnt = 0;

      for (const result of results) {
        if (!((result as Record<string, unknown>).id)) continue;
        const resultId = String((result as Record<string, unknown>).id);
        const key = makeKey(keyPrefix, model, resultId);

        const stringData: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) {
          if (v !== null && v !== undefined) {
            stringData[k] = String(v);
          }
        }
        await client.hset(key, stringData);
        cnt++;
      }

      return cnt;
    },

    async delete({
      model,
      where
    }: {
      model: string;
      where: CleanedWhere[];
    }): Promise<void> {
      const result = await this.findOne({ model, where });
      if (!result || !((result as Record<string, unknown>).id)) return;

      const resultId = String((result as Record<string, unknown>).id);
      const key = makeKey(keyPrefix, model, resultId);
      await client.del(key);

      if (model === "user" && (result as Record<string, unknown>).email) {
        await client.del(`${keyPrefix}email:${(result as Record<string, unknown>).email}`);
      }
    },

    async deleteMany({
      model,
      where
    }: {
      model: string;
      where?: CleanedWhere[];
    }): Promise<number> {
      const results = await this.findMany({ model, where, limit: 1000 });
      let cnt = 0;

      for (const result of results) {
        if (!((result as Record<string, unknown>).id)) continue;
        const id = (result as Record<string, unknown>).id as string;
        await this.delete({ model, where: [{ field: "id", value: id, operator: "eq", connector: "AND" }] });
        cnt++;
      }

      return cnt;
    },
  };
}

export function redisAdapter(client: Redis, config: RedisAdapterConfig) {
  const keyPrefix = config.keyPrefix || "auth:";

  const adapterCreator: AdapterFactoryCustomizeAdapterCreator = () => {
    return createRedisAdapter(client, keyPrefix);
  };

  const adapterFactory = createAdapterFactory({
    config: {
      adapterId: "redis",
      adapterName: "Redis Adapter",
      usePlural: false,
      debugLogs: false,
      supportsUUIDs: true,
      supportsJSON: true,
      supportsArrays: false,
      transaction: false,
    },
    adapter: adapterCreator,
  });

  return adapterFactory;
}
