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
    expect(indexContent).toContain("export * from './taskKeeper'");
    expect(indexContent).toContain("export * from './worker-queue'");
  });

  it('should re-export correct number of modules', () => {
    const reExports = indexContent.match(/export \* from '\.\/[\w-]+'/g);
    expect(reExports).toBeDefined();
    expect(reExports!.length).toBeGreaterThanOrEqual(4);

    const moduleNames = reExports?.map(r => r.match(/'\.\/([\w-]+)'/)?.[1]) || [];
    expect(moduleNames).toContain('redis');
    expect(moduleNames).toContain('timeouts');
    expect(moduleNames).toContain('taskKeeper');
    expect(moduleNames).toContain('worker-queue');
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

  it('taskKeeper.ts should export TaskRecordKeeper', () => {
    const taskKeeperPath = path.join(__dirname, 'taskKeeper.ts');
    const taskKeeperContent = fs.readFileSync(taskKeeperPath, 'utf-8');

    expect(taskKeeperContent).toContain('export class TaskRecordKeeper');
  });

  it('worker-queue/types.ts should export type definitions', () => {
    const typesPath = path.join(__dirname, 'worker-queue', 'types.ts');
    const typesContent = fs.readFileSync(typesPath, 'utf-8');

    expect(typesContent).toContain('export type WorkerJobType');
    expect(typesContent).toContain('export type WorkerJobStatus');
    expect(typesContent).toContain('export interface WorkerJobData');
    expect(typesContent).toContain('export interface ThreadNamingJobData');
    expect(typesContent).toContain('export interface ServiceActionJobData');
    expect(typesContent).toContain('export interface JobHistory');
    expect(typesContent).toContain('export interface ListJobsOptions');
    expect(typesContent).toContain('export interface QueueStats');
  });

  it('worker-queue/config.ts should export configuration', () => {
    const configPath = path.join(__dirname, 'worker-queue', 'config.ts');
    const configContent = fs.readFileSync(configPath, 'utf-8');

    expect(configContent).toContain('export const QUEUE_NAME');
    expect(configContent).toContain('export const QUEUE_PREFIX');
    expect(configContent).toContain('export const WORKER_QUEUE_CONFIG');
  });

  it('worker-queue should export all expected functions', () => {
    const workerQueuePath = path.join(__dirname, 'worker-queue', 'index.ts');
    const workerQueueContent = fs.readFileSync(workerQueuePath, 'utf-8');

    // Check for exported functions
    expect(workerQueueContent).toContain('export async function getWorkerQueue');
    expect(workerQueueContent).toContain('export async function addJob');
    expect(workerQueueContent).toContain('export async function getJob');
    expect(workerQueueContent).toContain('export async function listJobs');
    expect(workerQueueContent).toContain('export async function getJobHistory');
    expect(workerQueueContent).toContain('export async function getJobLogs');
    expect(workerQueueContent).toContain('export async function getQueueStats');
    expect(workerQueueContent).toContain('export async function rerunJob');
    expect(workerQueueContent).toContain('export async function cancelJob');
    expect(workerQueueContent).toContain('export async function deleteJob');
    expect(workerQueueContent).toContain('export async function startWorker');
    expect(workerQueueContent).toContain('export async function stopWorker');
    expect(workerQueueContent).toContain('export async function isWorkerQueueHealthy');
  });

  it('worker-queue/processor.ts should export worker functions', () => {
    const processorPath = path.join(__dirname, 'worker-queue', 'processor.ts');
    const processorContent = fs.readFileSync(processorPath, 'utf-8');

    expect(processorContent).toContain('export async function createWorker');
  });

  it('worker-queue/history.ts should export jobHistoryService', () => {
    const historyPath = path.join(__dirname, 'worker-queue', 'history.ts');
    const historyContent = fs.readFileSync(historyPath, 'utf-8');

    expect(historyContent).toContain('export const jobHistoryService');
  });

  it('worker-queue/logger.ts should export setupQueueLogging', () => {
    const loggerPath = path.join(__dirname, 'worker-queue', 'logger.ts');
    const loggerContent = fs.readFileSync(loggerPath, 'utf-8');

    expect(loggerContent).toContain('export function setupQueueLogging');
  });
});
