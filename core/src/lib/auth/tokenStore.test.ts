import { describe, it, expect, beforeEach } from 'vitest'
import { TokenStore } from './tokenStore'
import type { ApiTokenRecord } from './types'

function createMockRedis() {
  const store = new Map<string, Record<string, string>>()
  const sets = new Map<string, Set<string>>()

  const mock = {
    get: async (key: string) => {
      if (store.has(key)) {
        const data = store.get(key)!
        return data['id'] || data[key] || null
      }
      if (sets.has(key)) {
        const set = sets.get(key)!
        return set.values().next().value || null
      }
      return null
    },
    set: async (key: string, value: string) => {
      store.set(key, { id: value })
      return 'OK'
    },
    hgetall: async (key: string) => {
      return store.get(key) || {}
    },
    hset: async (key: string, data: Record<string, string>) => {
      const existing = store.get(key) || {}
      store.set(key, { ...existing, ...data })
      return 1
    },
    del: async (key: string) => {
      store.delete(key)
      return 1
    },
    sadd: async (key: string, value: string) => {
      if (!sets.has(key)) sets.set(key, new Set())
      sets.get(key)!.add(value)
      return 1
    },
    srem: async (key: string, value: string) => {
      sets.get(key)?.delete(value)
      return 1
    },
    smembers: async (key: string) => {
      return Array.from(sets.get(key) || [])
    },
    multi: () => {
      const operations: Array<[string, Record<string, string>]> = []
      const m = {
        hset: function(key: string, data: Record<string, string>) { 
          operations.push(['hset', { key, ...data }])
          return m 
        },
        set: function(key: string, value: string) { 
          operations.push(['set', { key, value }])
          return m 
        },
        del: function(key: string) { 
          operations.push(['del', { key }])
          return m 
        },
        sadd: function(key: string, value: string) { 
          operations.push(['sadd', { key, value }])
          return m 
        },
        srem: function(key: string, value: string) { 
          operations.push(['srem', { key, value }])
          return m 
        },
        exec: async () => {
          for (const [op, data] of operations) {
            switch (op) {
              case 'hset':
                const existing = store.get(data.key) || {}
                store.set(data.key, { ...existing, ...data })
                break
              case 'set':
                store.set(data.key, { id: data.value })
                break
              case 'del':
                store.delete(data.key)
                break
              case 'sadd':
                if (!sets.has(data.key)) sets.set(data.key, new Set())
                sets.get(data.key)!.add(data.value)
                break
              case 'srem':
                sets.get(data.key)?.delete(data.value)
                break
            }
          }
          return []
        },
      }
      return m
    },
  }

  return { mock, store, sets }
}

describe('TokenStore', () => {
  let tokenStore: TokenStore
  let mockRedis: ReturnType<typeof createMockRedis>['mock']

  beforeEach(() => {
    const { mock } = createMockRedis()
    mockRedis = mock
    tokenStore = new TokenStore(mockRedis as unknown as import('ioredis').Redis)
  })

  describe('create', () => {
    it('should create a new token', async () => {
      const token = await tokenStore.create('test-token', 'user-123')

      expect(token.id).toBeDefined()
      expect(token.name).toBe('test-token')
      expect(token.token).toMatch(/^brnd-/)
      expect(token.status).toBe('active')
      expect(token.userId).toBe('user-123')
      expect(token.createdAt).toBeDefined()
    })

    it('should throw error for duplicate name', async () => {
      await tokenStore.create('test-token', 'user-1')

      await expect(tokenStore.create('test-token', 'user-2'))
        .rejects.toThrow('Token name "test-token" already exists')
    })

    it('should create token without userId', async () => {
      const token = await tokenStore.create('admin-token')

      expect(token.userId).toBeUndefined()
    })
  })

  describe('get', () => {
    it('should return null for non-existent token', async () => {
      const result = await tokenStore.get('non-existent')
      expect(result).toBeNull()
    })

    it('should return token data', async () => {
      const created = await tokenStore.create('test-token', 'user-123')
      const retrieved = await tokenStore.get(created.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(created.id)
      expect(retrieved!.name).toBe('test-token')
      expect(retrieved!.status).toBe('active')
    })

    it('should include lastUsedAt when present', async () => {
      const created = await tokenStore.create('test-token')
      const now = new Date().toISOString()
      
      await mockRedis.hset(
        `bernard:tokens:id:${created.id}`,
        { lastUsedAt: now }
      )

      const retrieved = await tokenStore.get(created.id)
      expect(retrieved!.lastUsedAt).toBe(now)
    })
  })

  describe('update', () => {
    it('should return null for non-existent token', async () => {
      const result = await tokenStore.update('non-existent', { name: 'new-name' })
      expect(result).toBeNull()
    })

    it('should update token name', async () => {
      const created = await tokenStore.create('old-name')
      const updated = await tokenStore.update(created.id, { name: 'new-name' })

      expect(updated).not.toBeNull()
      expect(updated!.name).toBe('new-name')
    })

    it('should throw error for duplicate name on update', async () => {
      await tokenStore.create('token-1')
      const token2 = await tokenStore.create('token-2')

      await expect(tokenStore.update(token2.id, { name: 'token-1' }))
        .rejects.toThrow('Token name "token-1" already exists')
    })

    it('should update token status', async () => {
      const created = await tokenStore.create('test-token')
      const updated = await tokenStore.update(created.id, { status: 'revoked' })

      expect(updated).not.toBeNull()
      expect(updated!.status).toBe('revoked')
    })
  })

  describe('validate', () => {
    it('should return null for non-existent token', async () => {
      const result = await tokenStore.validate('non-existent-token')
      expect(result).toBeNull()
    })

    it('should return null for revoked token', async () => {
      const created = await tokenStore.create('test-token')
      await tokenStore.update(created.id, { status: 'revoked' })

      const result = await tokenStore.validate(created.token)
      expect(result).toBeNull()
    })

    it('should return token record for valid token', async () => {
      const created = await tokenStore.create('test-token')
      const result = await tokenStore.validate(created.token)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(created.id)
      expect(result!.lastUsedAt).toBeDefined()
    })
  })

  describe('resolve', () => {
    it('should delegate to validate', async () => {
      const created = await tokenStore.create('test-token')
      const result = await tokenStore.resolve(created.token)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(created.id)
    })
  })

  describe('delete', () => {
    it('should return false for non-existent token', async () => {
      const result = await tokenStore.delete('non-existent')
      expect(result).toBe(false)
    })

    it('should delete token and return true', async () => {
      const created = await tokenStore.create('test-token')
      const result = await tokenStore.delete(created.id)

      expect(result).toBe(true)
      expect(await tokenStore.get(created.id)).toBeNull()
    })
  })

  describe('list', () => {
    it('should return empty array for no tokens', async () => {
      const result = await tokenStore.list()
      expect(result).toEqual([])
    })

    it('should return all created tokens', async () => {
      await tokenStore.create('token-1')
      await tokenStore.create('token-2')
      await tokenStore.create('token-3')

      const result = await tokenStore.list()

      expect(result).toHaveLength(3)
      expect(result.map(t => t.name).sort()).toEqual(['token-1', 'token-2', 'token-3'])
    })
  })

  describe('exportAll', () => {
    it('should delegate to list', async () => {
      await tokenStore.create('test-token')
      const result = await tokenStore.exportAll()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('test-token')
    })
  })
})
