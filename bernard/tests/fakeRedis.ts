type HashStore = Map<string, Map<string, string>>;
type ListStore = Map<string, string[]>;
type ZSetStore = Map<string, Array<{ score: number; member: string }>>;

class FakeMulti {
  private actions: Array<() => void> = [];

  constructor(private readonly redis: FakeRedis) {}

  hset(key: string, values: Record<string, string | number>): this {
    this.actions.push(() => this.redis.hset(key, values));
    return this;
  }

  zadd(key: string, score: number, member: string): this {
    this.actions.push(() => this.redis.zadd(key, score, member));
    return this;
  }

  zrem(key: string, member: string): this {
    this.actions.push(() => this.redis.zrem(key, member));
    return this;
  }

  hincrby(key: string, field: string, increment: number): this {
    this.actions.push(() => this.redis.hincrby(key, field, increment));
    return this;
  }

  hincrbyfloat(key: string, field: string, increment: number): this {
    this.actions.push(() => this.redis.hincrbyfloat(key, field, increment));
    return this;
  }

  rpush(key: string, value: string): this {
    this.actions.push(() => this.redis.rpush(key, value));
    return this;
  }

  exec(): Promise<unknown[]> {
    this.actions.forEach((fn) => fn());
    return Promise.resolve([]);
  }
}

export class FakeRedis {
  private hashes: HashStore = new Map();
  private lists: ListStore = new Map();
  private zsets: ZSetStore = new Map();

  multi() {
    return new FakeMulti(this);
  }

  exists(key: string): Promise<number> {
    return Promise.resolve(this.hashes.has(key) ? 1 : 0);
  }

  hset(key: string, values: Record<string, string | number>): Promise<null> {
    const map = this.hashes.get(key) ?? new Map<string, string>();
    for (const [k, v] of Object.entries(values)) {
      map.set(k, String(v));
    }
    this.hashes.set(key, map);
    return Promise.resolve(null);
  }

  hget(key: string, field: string): Promise<string | undefined> {
    return Promise.resolve(this.hashes.get(key)?.get(field));
  }

  hgetall(key: string): Promise<Record<string, string>> {
    const map = this.hashes.get(key);
    if (!map) return Promise.resolve({} as Record<string, string>);
    const obj: Record<string, string> = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    return Promise.resolve(obj);
  }

  hincrby(key: string, field: string, increment: number): Promise<number> {
    const map = this.hashes.get(key) ?? new Map<string, string>();
    const current = parseFloat(map.get(field) ?? "0");
    const next = current + increment;
    map.set(field, String(next));
    this.hashes.set(key, map);
    return Promise.resolve(next);
  }

  hincrbyfloat(key: string, field: string, increment: number): Promise<number> {
    return this.hincrby(key, field, increment);
  }

  zadd(key: string, score: number, member: string): Promise<number> {
    const arr = this.zsets.get(key) ?? [];
    const existingIdx = arr.findIndex((item) => item.member === member);
    if (existingIdx >= 0) {
      arr[existingIdx].score = score;
    } else {
      arr.push({ score, member });
    }
    this.zsets.set(key, arr);
    return Promise.resolve(arr.length);
  }

  zrem(key: string, member: string): Promise<number> {
    const arr = this.zsets.get(key) ?? [];
    const next = arr.filter((item) => item.member !== member);
    this.zsets.set(key, next);
    return Promise.resolve(arr.length - next.length);
  }

  zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const arr = this.zsets.get(key) ?? [];
    return Promise.resolve(arr.filter((i) => i.score >= min && i.score <= max).map((i) => i.member));
  }

  zrevrangebyscore(key: string, max: number, min: number, _keyword?: string, offset = 0, count?: number): Promise<string[]> {
    const arr = this.zsets.get(key) ?? [];
    const filtered = arr.filter((i) => i.score <= max && i.score >= min).sort((a, b) => b.score - a.score);
    const sliced = filtered.slice(offset, count ? offset + count : undefined);
    return Promise.resolve(sliced.map((i) => i.member));
  }

  rpush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return Promise.resolve(list.length);
  }

  lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    let normalizedStart = start >= 0 ? start : list.length + start;
    if (normalizedStart < 0) normalizedStart = 0;
    let normalizedStop = stop >= 0 ? stop : list.length + stop;
    if (normalizedStop < 0) normalizedStop = 0;
    if (normalizedStop === -1 || normalizedStop >= list.length) normalizedStop = list.length - 1;
    return Promise.resolve(list.slice(normalizedStart, normalizedStop + 1));
  }
}

