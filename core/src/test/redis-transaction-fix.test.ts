import { describe, it, expect, beforeEach } from 'vitest'
import { redisClientMock, resetRedisMock } from '../test/mocks/redis-client'

describe('Redis mock transaction fixes', () => {
  beforeEach(() => {
    resetRedisMock()
  })

  it('should execute hset operations in transactions', async () => {
    const tx = redisClientMock.multi()
    tx.hset('test:hash', 'field1', 'value1')
    tx.hset('test:hash', 'field2', 'value2')
    await tx.exec()

    const result = await redisClientMock.hgetall('test:hash')
    expect(result).toEqual({ field1: 'value1', field2: 'value2' })
  })

  it('should execute sadd/srem operations in transactions', async () => {
    const tx = redisClientMock.multi()
    tx.sadd('test:set', 'member1', 'member2', 'member3')
    tx.srem('test:set', 'member2')
    await tx.exec()

    const result = await redisClientMock.smembers('test:set')
    expect(result).toEqual(['member1', 'member3'])
  })

  it('should execute mixed operations in transactions', async () => {
    const tx = redisClientMock.multi()
    tx.hset('test:mixed', 'count', '1')
    tx.sadd('test:mixed:set', 'a', 'b')
    tx.srem('test:mixed:set', 'b')
    tx.sadd('test:mixed:set', 'c')
    await tx.exec()

    const hashResult = await redisClientMock.hgetall('test:mixed')
    const setResult = await redisClientMock.smembers('test:mixed:set')

    expect(hashResult).toEqual({ count: '1' })
    expect(setResult).toEqual(['a', 'c'])
  })
})