import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('infra barrel export', () => {
  const indexPath = path.join(__dirname, 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export all expected modules', () => {
    expect(indexContent).toContain("export * from './redis'");
    expect(indexContent).toContain("export * from './timeouts'");
    expect(indexContent).toContain("export * from './queue'");
    expect(indexContent).toContain("export * from './taskKeeper'");
    expect(indexContent).toContain("export * from './service-queue'");
  });

  it('should re-export correct number of modules', () => {
    const reExports = indexContent.match(/export \* from '\.\/[\w-]+'/g);
    expect(reExports).toBeDefined();
    expect(reExports!.length).toBeGreaterThanOrEqual(4);
    
    const moduleNames = reExports?.map(r => r.match(/'\.\/([\w-]+)'/)?.[1]) || [];
    expect(moduleNames).toContain('redis');
    expect(moduleNames).toContain('timeouts');
    expect(moduleNames).toContain('queue');
    expect(moduleNames).toContain('taskKeeper');
    expect(moduleNames).toContain('service-queue');
  });
});

describe('infra exports verification', () => {
  it('redis.ts should export getRedis and retryStrategy', () => {
    const redisPath = path.join(__dirname, 'redis.ts');
    const redisContent = fs.readFileSync(redisPath, 'utf-8');
    
    expect(redisContent).toContain('export function getRedis');
    expect(redisContent).toContain('export function retryStrategy');
  });

  it('timeouts.ts should export withTimeout', () => {
    const timeoutsPath = path.join(__dirname, 'timeouts.ts');
    const timeoutsContent = fs.readFileSync(timeoutsPath, 'utf-8');
    
    expect(timeoutsContent).toContain('export async function withTimeout');
  });

  it('queue.ts should export queue functions', () => {
    const queuePath = path.join(__dirname, 'queue.ts');
    const queueContent = fs.readFileSync(queuePath, 'utf-8');
    
    expect(queueContent).toContain('export function getUtilityQueue');
    expect(queueContent).toContain('export function getBullMqRedis');
    expect(queueContent).toContain('export async function startUtilityWorker');
    expect(queueContent).toContain('export async function addUtilityJob');
    expect(queueContent).toContain('export async function stopUtilityWorker');
    expect(queueContent).toContain('export async function isUtilityQueueHealthy');
  });

  it('taskKeeper.ts should export TaskRecordKeeper', () => {
    const taskKeeperPath = path.join(__dirname, 'taskKeeper.ts');
    const taskKeeperContent = fs.readFileSync(taskKeeperPath, 'utf-8');
    
    expect(taskKeeperContent).toContain('export class TaskRecordKeeper');
  });

  it('service-queue/types.ts should export type definitions', () => {
    const typesPath = path.join(__dirname, 'service-queue', 'types.ts');
    const typesContent = fs.readFileSync(typesPath, 'utf-8');
    
    expect(typesContent).toContain('export type ServiceAction =');
    expect(typesContent).toContain('export interface ServiceActionJobData');
    expect(typesContent).toContain('export interface ServiceActionResult');
    expect(typesContent).toContain('export interface ServiceJobInfo');
    expect(typesContent).toContain('export interface ServiceQueueStats');
  });

  it('service-queue should export all expected functions', () => {
    const serviceQueuePath = path.join(__dirname, 'service-queue', 'index.ts');
    const serviceQueueContent = fs.readFileSync(serviceQueuePath, 'utf-8');
    
    // Check for exported functions
    expect(serviceQueueContent).toContain('export async function getServiceQueue');
    expect(serviceQueueContent).toContain('export async function addServiceJob');
    expect(serviceQueueContent).toContain('export async function getServiceJobStatus');
    expect(serviceQueueContent).toContain('export async function getServiceJobs');
    expect(serviceQueueContent).toContain('export async function getAllServiceJobs');
    expect(serviceQueueContent).toContain('export async function getQueueStats');
    expect(serviceQueueContent).toContain('export async function retryJob');
    expect(serviceQueueContent).toContain('export async function cancelJob');
    expect(serviceQueueContent).toContain('export async function closeServiceQueue');
  });

  it('service-queue/init.ts should export initialization functions', () => {
    const initPath = path.join(__dirname, 'service-queue', 'init.ts');
    const initContent = fs.readFileSync(initPath, 'utf-8');
    
    expect(initContent).toContain('export async function initializeServiceQueue');
    expect(initContent).toContain('export function isServiceQueueInitialized');
  });

  it('service-queue/worker.ts should export worker functions', () => {
    const workerPath = path.join(__dirname, 'service-queue', 'worker.ts');
    const workerContent = fs.readFileSync(workerPath, 'utf-8');
    
    expect(workerContent).toContain('export async function startServiceWorker');
    expect(workerContent).toContain('export async function stopServiceWorker');
  });
});
