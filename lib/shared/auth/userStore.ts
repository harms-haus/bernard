import type { Redis } from "ioredis";
import { UserRecord } from "./types";

export type UserStatus = "active" | "disabled" | "deleted";

const DEFAULT_NAMESPACE = "bernard:users";

export class UserStore {
  private readonly namespace: string;

  constructor(private readonly redis: Redis, namespace = DEFAULT_NAMESPACE) {
    this.namespace = namespace;
  }

  private userKey(id: string) {
    return `${this.namespace}:id:${id}`;
  }

  private idsSet() {
    return `${this.namespace}:ids`;
  }

  private sanitize(record: Record<string, string>): UserRecord | null {
    const id = record["id"];
    const displayName = record["displayName"];
    const createdAt = record["createdAt"];
    if (!id || !displayName || !createdAt) return null;
    const updatedAt = record["updatedAt"] ?? createdAt;
    const status = (record["status"] as UserRecord["status"]) ?? "active";
    const isAdmin = record["isAdmin"] === "true";
    
    const user: UserRecord = {
      id,
      displayName,
      isAdmin,
      status,
      createdAt,
      updatedAt
    };
    
    if (record["avatarUrl"]) user.avatarUrl = record["avatarUrl"];
    if (record["email"]) user.email = record["email"];
    
    return user;
  }

  async setStatus(id: string, status: UserRecord["status"]): Promise<UserRecord | null> {
    const key = this.userKey(id);
    const existing = await this.redis.hgetall(key);
    if (!existing || !existing["id"]) return null;
    
    await this.redis.hset(key, { status, updatedAt: new Date().toISOString() });
    const updated = await this.redis.hgetall(key);
    return this.sanitize(updated);
  }

  private async userCount(): Promise<number> {
    return this.redis.scard(this.idsSet());
  }

  async upsertOAuthUser(id: string, displayName: string, email?: string, avatarUrl?: string): Promise<UserRecord> {
    const key = this.userKey(id);
    const existing = await this.redis.hgetall(key);
    if (existing && existing["status"] === "deleted") {
      throw new Error("User has been deleted");
    }
    const now = new Date().toISOString();

    if (existing && existing["id"]) {
      const updates: Record<string, string> = { displayName, updatedAt: now };
      if (email) updates["email"] = email;
      if (avatarUrl) updates["avatarUrl"] = avatarUrl;
      await this.redis.hset(key, updates);
      const updated = await this.redis.hgetall(key);
      const sanitized = this.sanitize(updated);
      if (!sanitized) throw new Error("Invalid stored user");
      return sanitized;
    }

    const isFirstUserAdmin = (await this.userCount()) === 0;
    const record: UserRecord = {
      id,
      displayName,
      isAdmin: isFirstUserAdmin,
      status: "active",
      createdAt: now,
      updatedAt: now,
      email,
      avatarUrl
    };

    await this.redis
      .multi()
      .hset(key, {
        id: record.id,
        displayName: record.displayName,
        isAdmin: String(record.isAdmin),
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        email: record.email ?? "",
        avatarUrl: record.avatarUrl ?? ""
      })
      .sadd(this.idsSet(), record.id)
      .exec();

    return record;
  }

  async create(user: { id: string; displayName: string; isAdmin: boolean }): Promise<UserRecord> {
    const key = this.userKey(user.id);
    const existing = await this.redis.hgetall(key);
    if (existing && existing["id"]) {
      throw new Error("User already exists");
    }
    const now = new Date().toISOString();
    const record: UserRecord = {
      id: user.id,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    await this.redis
      .multi()
      .hset(key, {
        id: record.id,
        displayName: record.displayName,
        isAdmin: String(record.isAdmin),
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      })
      .sadd(this.idsSet(), record.id)
      .exec();

    return record;
  }

  async get(id: string): Promise<UserRecord | null> {
    const data = await this.redis.hgetall(this.userKey(id));
    if (!data || !data["id"]) return null;
    return this.sanitize(data);
  }

  async list(): Promise<UserRecord[]> {
    const ids = await this.redis.smembers(this.idsSet());
    const users = await Promise.all(ids.map((id: string) => this.get(id)));
    return users.filter((u): u is UserRecord => u !== null);
  }

  async update(id: string, updates: { displayName?: string; isAdmin?: boolean; status?: UserStatus }): Promise<UserRecord | null> {
    const existing = await this.redis.hgetall(this.userKey(id));
    if (!existing || !existing["id"]) return null;
    if (existing["status"] === "deleted") return null;
    
    const next: Record<string, string> = { updatedAt: new Date().toISOString() };
    if (updates.displayName) next["displayName"] = updates.displayName;
    if (typeof updates.isAdmin === "boolean") next["isAdmin"] = String(updates.isAdmin);
    if (updates.status) next["status"] = updates.status;
    
    await this.redis.hset(this.userKey(id), next);
    const saved = await this.redis.hgetall(this.userKey(id));
    return this.sanitize(saved);
  }

  async delete(id: string): Promise<UserRecord | null> {
    const existing = await this.redis.hgetall(this.userKey(id));
    if (!existing || !existing["id"]) return null;

    const redactedName = existing["displayName"] ? `deleted-${existing["displayName"]}` : "deleted user";
    const now = new Date().toISOString();
    await this.redis.hset(this.userKey(id), {
      displayName: redactedName,
      isAdmin: "false",
      status: "deleted",
      updatedAt: now
    });
    const saved = await this.redis.hgetall(this.userKey(id));
    return this.sanitize(saved);
  }

  async exportAll(): Promise<UserRecord[]> {
    return this.list();
  }
}

