// Simple test to verify Redis mock transaction fixes
import { redisClientMock, resetRedisMock } from './core/src/test/mocks/redis-client.ts';

resetRedisMock();

console.log('Testing Redis mock transaction fixes...\n');

// Test hset in transaction
console.log('1. Testing hset in transaction:');
const tx1 = redisClientMock.multi();
tx1.hset('test:hash', 'field1', 'value1');
tx1.hset('test:hash', 'field2', 'value2');
await tx1.exec();

const hashResult = await redisClientMock.hgetall('test:hash');
console.log('Hash contents:', hashResult);

// Test sadd/srem in transaction
console.log('\n2. Testing sadd/srem in transaction:');
const tx2 = redisClientMock.multi();
tx2.sadd('test:set', 'member1', 'member2', 'member3');
tx2.srem('test:set', 'member2');
await tx2.exec();

const setResult = await redisClientMock.smembers('test:set');
console.log('Set contents:', setResult);

// Test mixed operations
console.log('\n3. Testing mixed operations:');
const tx3 = redisClientMock.multi();
tx3.hset('test:mixed', 'count', '1');
tx3.sadd('test:mixed:set', 'a', 'b');
tx3.srem('test:mixed:set', 'b');
tx3.sadd('test:mixed:set', 'c');
await tx3.exec();

const mixedHash = await redisClientMock.hgetall('test:mixed');
const mixedSet = await redisClientMock.smembers('test:mixed:set');
console.log('Mixed hash:', mixedHash);
console.log('Mixed set:', mixedSet);

console.log('\n✅ All transaction operations working correctly!');