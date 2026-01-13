/**
 * Pre-configured Redis mock for testing
 */

import { vi } from 'vitest'

let isConnected = false
const hashes = new Map<string, Record<string, string>>()
const sets = new Map<string, Set<string>>()

export const redisClientMock = {
  connect: vi.fn(async () => {
    isConnected = true
  }),
  quit: vi.fn(async () => {
    isConnected = false
  }),
  ping: vi.fn(async () => {
    if (!isConnected) {
      throw new Error('Connection is closed')
    }
    return 'PONG'
  }),
  get isOpen() {
    return isConnected
  },
  scan: vi.fn().mockResolvedValue({
    cursor: '0',
    keys: [],
  }),
  json: {
    set: vi.fn(),
    get: vi.fn(),
  },
  keys: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
  hgetall: vi.fn().mockImplementation(async (key: string) => {
    return hashes.get(key) || {}
  }),
  hset: vi.fn().mockImplementation(async (key: string, field: string, value: string) => {
    if (!hashes.has(key)) {
      hashes.set(key, {})
    }
    const hash = hashes.get(key)!
    hash[field] = value
    return 1
  }),
  hdel: vi.fn().mockImplementation(async (key: string, ...fields: string[]) => {
    const hash = hashes.get(key)
    if (!hash) return 0

    let count = 0
    for (const field of fields) {
      if (field in hash) {
        delete hash[field]
        count++
      }
    }
    return count
  }),
  hmget: vi.fn().mockImplementation(async (key: string, ...fields: string[]) => {
    const hash = hashes.get(key)
    if (!hash) return fields.map(() => null)

    return fields.map(f => (f in hash ? hash[f] : null))
  }),
  srem: vi.fn().mockImplementation(async (key: string, ...members: string[]) => {
    const set = sets.get(key)
    if (!set) return 0

    let count = 0
    for (const member of members) {
      if (set.delete(member)) {
        count++
      }
    }
    return count
  }),
  sadd: vi.fn().mockImplementation(async (key: string, ...members: string[]) => {
    if (!sets.has(key)) {
      sets.set(key, new Set())
    }
    const set = sets.get(key)!
    let addedCount = 0
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member)
        addedCount++
      }
    }
    return addedCount
  }),
  scard: vi.fn().mockImplementation(async (key: string) => {
    const set = sets.get(key)
    return set ? set.size : 0
  }),
  smembers: vi.fn().mockImplementation(async (key: string) => {
    const set = sets.get(key)
    return set ? Array.from(set) : []
  }),
  multi: vi.fn().mockImplementation((): any => {
    const operations: Array<{ type: string; key: string; args: any[] }> = []

    const hset = (key: string, field: string, value: string) => {
      operations.push({ type: 'hset', key, args: [key, field, value] })
      return hset
    }

    const srem = (key: string, ...members: string[]) => {
      operations.push({ type: 'srem', key, args: [key, ...members] })
      return srem
    }

    const del = (...keys: string[]) => {
      operations.push({ type: 'del', key: '', args: keys })
      return del
    }

    const expire = (key: string, seconds: number) => {
      operations.push({ type: 'expire', key, args: [seconds] })
      return expire
    }

    const sadd = (key: string, ...members: string[]) => {
      operations.push({ type: 'sadd', key, args: [key, ...members] })
      return sadd
    }

    const exec = async () => {
      for (const op of operations) {
        switch (op.type) {
          case 'hset':
            const [hsetKey, field, value] = op.args
            if (!hashes.has(hsetKey)) {
              hashes.set(hsetKey, {})
            }
            const hash = hashes.get(hsetKey)!
            hash[field] = value
            break
          case 'srem':
            const [sremKey, ...members] = op.args
            if (!sets.has(sremKey)) {
              sets.set(sremKey, new Set())
            }
            const set = sets.get(sremKey)!
            for (const member of members) {
              set.delete(member)
            }
            break
          case 'sadd':
            const [saddKey, ...saddMembers] = op.args
            if (!sets.has(saddKey)) {
              sets.set(saddKey, new Set())
            }
            const saddSet = sets.get(saddKey)!
            for (const member of saddMembers) {
              saddSet.add(member)
            }
            break
          case 'del':
            for (const key of op.args) {
              hashes.delete(key)
              sets.delete(key)
            }
            break
        }
      }
      return Array(operations.length).fill(null)
    }

    return { hset, srem, del, expire, sadd, exec }
  }),
}

export function resetRedisMock() {
  isConnected = false
  hashes.clear()
  sets.clear()
  redisClientMock.connect.mockClear()
  redisClientMock.quit.mockClear()
  redisClientMock.ping.mockClear()
  redisClientMock.scan.mockClear()
  redisClientMock.json.set.mockClear()
  redisClientMock.json.get.mockClear()
  redisClientMock.keys.mockClear()
  redisClientMock.expire.mockClear()
  redisClientMock.del.mockClear()
  redisClientMock.hgetall.mockClear()
  redisClientMock.hset.mockClear()
  redisClientMock.hdel.mockClear()
  redisClientMock.hmget.mockClear()
  redisClientMock.srem.mockClear()
  redisClientMock.sadd.mockClear()
  redisClientMock.scard.mockClear()
  redisClientMock.smembers.mockClear()
  redisClientMock.multi.mockClear()
}

export interface MockRedisTransaction {
  hset(key: string, field: string, value: string): MockRedisTransaction
  srem(key: string, ...members: string[]): MockRedisTransaction
  del(...keys: string[]): MockRedisTransaction
  sadd(key: string, ...members: string[]): MockRedisTransaction
  exec(): Promise<unknown[]>
}

export const multi = vi.fn().mockImplementation((): any => {
  const operations: Array<{ type: string; key: string; args: any[] }> = []

  const hset = (key: string, field: string, value: string) => {
    operations.push({ type: 'hset', key, args: [key, field, value] })
    return multi as any
  }

  const srem = (key: string, ...members: string[]) => {
    operations.push({ type: 'srem', key, args: [key, ...members] })
    return multi as any
  }

  const sadd = (key: string, ...members: string[]) => {
    operations.push({ type: 'sadd', key, args: [key, ...members] })
    return multi as any
  }

  const del = (...keys: string[]) => {
    operations.push({ type: 'del', key: '', args: keys })
    return multi as any
  }

  const exec = async () => {
    for (const op of operations) {
      switch (op.type) {
        case 'hset':
          const [hsetKey, field, value] = op.args
          if (!hashes.has(hsetKey)) {
            hashes.set(hsetKey, {})
          }
          const hash = hashes.get(hsetKey)!
          hash[field] = value
          break
        case 'srem':
          const [sremKey, ...members] = op.args
          if (!sets.has(sremKey)) {
            sets.set(sremKey, new Set())
          }
          const set = sets.get(sremKey)!
          for (const member of members) {
            set.delete(member)
          }
          break
        case 'sadd':
          const [saddKey, ...saddMembers] = op.args
          if (!sets.has(saddKey)) {
            sets.set(saddKey, new Set())
          }
          const saddSet = sets.get(saddKey)!
          for (const member of saddMembers) {
            saddSet.add(member)
          }
          break
        case 'del':
          for (const key of op.args) {
            hashes.delete(key)
            sets.delete(key)
          }
          break
      }
    }
    return Array(operations.length).fill(null)
  }
})