import { createAdapterFactory } from "better-auth/adapters";
import type { Redis } from "ioredis";

interface RedisAdapterConfig {
    /**
     * Prefix for all keys
     * @default "ba"
     */
    prefix?: string;
}

export const redisAdapter = (redis: Redis, config: RedisAdapterConfig = {}) => {
    const prefix = config.prefix || "ba";

    const getModelKey = (model: string, id: string) => `${prefix}:m:${model}:${id}`;
    const getIndexKey = (model: string, field: string, value: any) => `${prefix}:i:${model}:${field}:${String(value)}`;
    const getSetKey = (model: string) => `${prefix}:s:${model}:ids`;

    return createAdapterFactory({
        config: {
            adapterId: "redis",
            adapterName: "Redis Adapter",
            supportsJSON: true,
            supportsDates: true,
            supportsBooleans: true,
            supportsNumericIds: false,
        },
        adapter: ({ schema }) => {
            const getUniqueFields = (modelName: string) => {
                const model = schema[modelName];
                if (!model) return [];
                return Object.entries(model.fields)
                    .filter(([_, attr]) => attr.unique)
                    .map(([name]) => name);
            };

            const matchWhere = (data: any, where: any[]) => {
                if (!where || where.length === 0) return true;
                return where.every((v) => {
                    const val = data[v.field];
                    const target = v.value;
                    switch (v.operator || "eq") {
                        case "eq": return val === target;
                        case "ne": return val !== target;
                        case "contains": return String(val).includes(String(target));
                        case "starts_with": return String(val).startsWith(String(target));
                        case "ends_with": return String(val).endsWith(String(target));
                        case "in": return Array.isArray(target) && target.includes(val);
                        default: return val === target;
                    }
                });
            };

            const adapter = {
                create: async ({ model, data }: { model: string, data: any }) => {
                    const id = data.id as string;
                    const key = getModelKey(model, id);
                    const setKey = getSetKey(model);

                    const uniqueFields = getUniqueFields(model);
                    const pipeline = redis.pipeline();

                    const serialized = Object.entries(data).reduce((acc, [k, v]) => {
                        acc[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
                        return acc;
                    }, {} as Record<string, string>);

                    pipeline.hset(key, serialized);
                    pipeline.sadd(setKey, id);

                    for (const field of uniqueFields) {
                        if (data[field]) {
                            pipeline.set(getIndexKey(model, field, data[field]), id);
                        }
                    }

                    await pipeline.exec();
                    return data;
                },

                findOne: async ({ model, where }: { model: string, where?: any[] }) => {
                    const uniqueFields = getUniqueFields(model);
                    const filters = where || [];
                    const uniqueWhere = filters.find(w => uniqueFields.includes(w.field) && (w.operator === "eq" || !w.operator));

                    let id: string | null = null;
                    if (uniqueWhere) {
                        id = await redis.get(getIndexKey(model, uniqueWhere.field, uniqueWhere.value));
                    }

                    if (id) {
                        const data = await redis.hgetall(getModelKey(model, id));
                        if (Object.keys(data).length === 0) return null;

                        const parsed = Object.entries(data).reduce((acc, [k, v]) => {
                            try { acc[k] = JSON.parse(v); } catch { acc[k] = v; }
                            return acc;
                        }, {} as any);

                        return matchWhere(parsed, filters) ? parsed : null;
                    }

                    const allIds = await redis.smembers(getSetKey(model));
                    for (const recordId of allIds) {
                        const data = await redis.hgetall(getModelKey(model, recordId));
                        const parsed = Object.entries(data).reduce((acc, [k, v]) => {
                            try { acc[k] = JSON.parse(v); } catch { acc[k] = v; }
                            return acc;
                        }, {} as any);

                        if (matchWhere(parsed, filters)) return parsed;
                    }

                    return null;
                },

                findMany: async ({ model, where, limit, offset, sortBy }: { model: string, where?: any[], limit?: number, offset?: number, sortBy?: { field: string, direction: 'asc' | 'desc' } }) => {
                    const allIds = await redis.smembers(getSetKey(model));
                    let records: any[] = [];

                    for (const recordId of allIds) {
                        const data = await redis.hgetall(getModelKey(model, recordId));
                        if (Object.keys(data).length === 0) continue;

                        const parsed = Object.entries(data).reduce((acc, [k, v]) => {
                            try { acc[k] = JSON.parse(v); } catch { acc[k] = v; }
                            return acc;
                        }, {} as any);

                        if (matchWhere(parsed, where || [])) {
                            records.push(parsed);
                        }
                    }

                    if (sortBy) {
                        records.sort((a, b) => {
                            const valA = a[sortBy.field];
                            const valB = b[sortBy.field];
                            if (valA < valB) return sortBy.direction === 'asc' ? -1 : 1;
                            if (valA > valB) return sortBy.direction === 'asc' ? 1 : -1;
                            return 0;
                        });
                    }

                    if (offset) records = records.slice(offset);
                    if (limit !== undefined) records = records.slice(0, limit);

                    return records;
                },

                update: async ({ model, where, update }: { model: string, where?: any[], update: any }) => {
                    const record = await adapter.findOne({ model, where });
                    if (!record) return null;

                    const id = record.id;
                    const key = getModelKey(model, id);
                    const uniqueFields = getUniqueFields(model);

                    const newData = { ...record, ...update };
                    const pipeline = redis.pipeline();

                    const serialized = Object.entries(newData).reduce((acc, [k, v]) => {
                        acc[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
                        return acc;
                    }, {} as Record<string, string>);

                    pipeline.hset(key, serialized);

                    for (const field of uniqueFields) {
                        if (update[field] !== undefined && update[field] !== record[field]) {
                            if (record[field]) pipeline.del(getIndexKey(model, field, record[field]));
                            pipeline.set(getIndexKey(model, field, update[field]), id);
                        }
                    }

                    await pipeline.exec();
                    return newData;
                },

                delete: async ({ model, where }: { model: string, where?: any[] }) => {
                    const record = await adapter.findOne({ model, where });
                    if (!record) return;

                    const id = record.id;
                    const pipeline = redis.pipeline();
                    pipeline.del(getModelKey(model, id));
                    pipeline.srem(getSetKey(model), id);

                    const uniqueFields = getUniqueFields(model);
                    for (const field of uniqueFields) {
                        if (record[field]) pipeline.del(getIndexKey(model, field, record[field]));
                    }

                    await pipeline.exec();
                },

                updateMany: async ({ model, where, update }: { model: string, where?: any[], update: any }) => {
                    const records = await adapter.findMany({ model, where });
                    const pipeline = redis.pipeline();
                    const uniqueFields = getUniqueFields(model);

                    for (const record of records) {
                        const id = record.id;
                        const key = getModelKey(model, id);
                        const newData = { ...record, ...update };

                        const serialized = Object.entries(newData).reduce((acc, [k, v]) => {
                            acc[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
                            return acc;
                        }, {} as Record<string, string>);

                        pipeline.hset(key, serialized);

                        for (const field of uniqueFields) {
                            if (update[field] !== undefined && update[field] !== record[field]) {
                                if (record[field]) pipeline.del(getIndexKey(model, field, record[field]));
                                pipeline.set(getIndexKey(model, field, update[field]), id);
                            }
                        }
                    }

                    await pipeline.exec();
                    return records.length;
                },

                deleteMany: async ({ model, where }: { model: string, where?: any[] }) => {
                    const records = await adapter.findMany({ model, where });
                    const pipeline = redis.pipeline();
                    const uniqueFields = getUniqueFields(model);

                    for (const record of records) {
                        const id = record.id;
                        pipeline.del(getModelKey(model, id));
                        pipeline.srem(getSetKey(model), id);
                        for (const field of uniqueFields) {
                            if (record[field]) pipeline.del(getIndexKey(model, field, record[field]));
                        }
                    }

                    await pipeline.exec();
                    return records.length;
                },

                count: async ({ model, where }: { model: string, where?: any[] }) => {
                    const records = await adapter.findMany({ model, where });
                    return records.length;
                }
            };

            return adapter;
        },
    });
};
