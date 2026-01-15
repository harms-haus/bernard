import { createAdapterFactory, type Where } from "@better-auth/core/db/adapter";
import type { Redis } from "ioredis";
import type { BetterAuthOptions } from "better-auth";

interface RedisAdapterConfig {
  client: Redis;
  keyPrefix?: string;
}

function makeKey(prefix: string, model: string, id: string): string {
  return `${prefix}${model}:${id}`;
}

/**
 * Transform raw Redis hash data into Better Auth user object
 */
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

export function redisAdapter(client: Redis, config: RedisAdapterConfig) {
  const keyPrefix = config.keyPrefix || "auth:";

  const createCustomAdapter = (db: Redis) => {
    return () => {
      function convertWhere(where: Where[], data: Record<string, string>): boolean {
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
        async create({ model, data }: { model: string; data: Record<string, unknown> }) {
          const id = String(data.id || crypto.randomUUID());
          const key = makeKey(keyPrefix, model, id);

          const stringData: Record<string, string> = {};
          for (const [k, v] of Object.entries(data)) {
            if (v !== null && v !== undefined) {
              stringData[k] = String(v);
            }
          }
          await db.hset(key, stringData);
          
          if (model === "user" && data.email) {
            await db.set(`${keyPrefix}email:${data.email}`, id);
          }
          
          return { id, ...data };
        },

        async findOne({ model, where }: { model: string; where: Where[] }) {
          if (where.length === 1 && where[0].field === "id") {
            const key = makeKey(keyPrefix, model, String(where[0].value));
            const data = await db.hgetall(key);
            if (Object.keys(data).length === 0) return null;

            if (model === "user") {
              return transformUserData(data);
            }

            return data;
          }

          if (where.length === 1 && where[0].field === "email" && model === "user") {
            const id = await db.get(`${keyPrefix}email:${String(where[0].value)}`);
            if (!id) return null;
            const key = makeKey(keyPrefix, model, id);
            const data = await db.hgetall(key);
            if (Object.keys(data).length === 0) return null;

            return transformUserData(data);
          }

          const pattern = makeKey(keyPrefix, model, "*");
          const keys = await db.keys(pattern);

          for (const key of keys) {
            const data = await db.hgetall(key);
            if (convertWhere(where, data)) {
              if (model === "user") {
                return transformUserData(data);
              }
              return data;
            }
          }

          return null;
        },

        async findMany({
          model,
          where,
          limit = 100,
          offset = 0
        }: {
          model: string;
          where?: Where[];
          limit?: number;
          offset?: number;
        }) {
          const pattern = makeKey(keyPrefix, model, "*");
          const keys = await db.keys(pattern);
          const results: any[] = [];

          for (const key of keys.slice(offset, offset + limit)) {
            const data = await db.hgetall(key);
            if (!where || where.length === 0) {
              results.push(model === "user" ? transformUserData(data) : data);
            } else if (convertWhere(where, data)) {
              results.push(model === "user" ? transformUserData(data) : data);
            }
          }

          return results;
        },

        async count({ model, where }: { model: string; where?: Where[] }) {
          const pattern = makeKey(keyPrefix, model, "*");
          const keys = await db.keys(pattern);
          
          if (!where || where.length === 0) {
            return keys.length;
          }

          let cnt = 0;
          for (const key of keys) {
            const data = await db.hgetall(key);
            if (convertWhere(where, data)) {
              cnt++;
            }
          }
          
          return cnt;
        },

        async update({ 
          model, 
          where, 
          update: values 
        }: { 
          model: string; 
          where: Where[]; 
          update: Record<string, unknown>;
        }) {
          const result = await this.findOne({ model, where });
          if (!result || !result.id) return null;

          const key = makeKey(keyPrefix, model, result.id);
          
          const stringData: Record<string, string> = {};
          for (const [k, v] of Object.entries(values)) {
            if (v !== null && v !== undefined) {
              stringData[k] = String(v);
            }
          }
          await db.hset(key, stringData);
          
          if (model === "user" && "email" in values && result.email && values.email !== result.email) {
            await db.set(`${keyPrefix}email:${values.email}`, result.id);
            await db.del(`${keyPrefix}email:${result.email}`);
          }

          return values;
        },

        async updateMany({ 
          model, 
          where, 
          update: values 
        }: { 
          model: string; 
          where?: Where[]; 
          update: Record<string, unknown>;
        }) {
          const results = await this.findMany({ model, where });
          let cnt = 0;

          for (const result of results) {
            if (!result.id) continue;
            const key = makeKey(keyPrefix, model, result.id);
            
            const stringData: Record<string, string> = {};
            for (const [k, v] of Object.entries(values)) {
              if (v !== null && v !== undefined) {
                stringData[k] = String(v);
              }
            }
            await db.hset(key, stringData);
            cnt++;
          }

          return cnt;
        },

        async delete({ model, where }: { model: string; where: Where[] }) {
          const result = await this.findOne({ model, where });
          if (!result || !result.id) return;

          const key = makeKey(keyPrefix, model, result.id);
          await db.del(key);

          if (model === "user" && result.email) {
            await db.del(`${keyPrefix}email:${result.email}`);
          }
        },

        async deleteMany({ 
          model, 
          where 
        }: { 
          model: string; 
          where?: Where[]; 
        }) {
          const results = await this.findMany({ model, where });
          let cnt = 0;

          for (const result of results) {
            if (!result.id) continue;
            await this.delete({ model, where: [{ field: "id", value: result.id }] });
            cnt++;
          }

          return cnt;
        },
      };
    };
  };

  const adapterOptions = {
    config: {
      adapterId: "redis",
      adapterName: "Redis Adapter",
      usePlural: false,
      debugLogs: false,
      supportsUUIDs: true,
      supportsJSON: true,
      supportsArrays: false,
    },
    adapter: createCustomAdapter(client),
  };

  const adapter = createAdapterFactory(adapterOptions as any);

  return (options: BetterAuthOptions) => {
    return adapter(options);
  };
}
