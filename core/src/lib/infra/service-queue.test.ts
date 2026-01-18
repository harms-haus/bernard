import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('service-queue barrel export (service-queue/service-queue.ts)', () => {
  const indexPath = path.join(__dirname, 'service-queue', 'service-queue.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export types from types module', () => {
    expect(indexContent).toContain("export * from './types'");
  });

  it('should export from index module', () => {
    expect(indexContent).toContain("export * from './index'");
  });

  it('should export from worker module', () => {
    expect(indexContent).toContain("export * from './worker'");
  });

  it('should export init functions', () => {
    expect(indexContent).toContain('initializeServiceQueue');
    expect(indexContent).toContain('isServiceQueueInitialized');
  });
});

describe('service-queue/types.ts', () => {
  const typesPath = path.join(__dirname, 'service-queue', 'types.ts');
  let typesContent: string;

  beforeEach(() => {
    typesContent = fs.readFileSync(typesPath, 'utf-8');
  });

  it('should define ServiceAction type', () => {
    expect(typesContent).toContain('export type ServiceAction = "start" | "stop" | "restart" | "check"');
  });

  it('should define ServiceActionJobData interface', () => {
    expect(typesContent).toContain('export interface ServiceActionJobData');
    expect(typesContent).toContain('serviceId: string');
    expect(typesContent).toContain('action: ServiceAction');
    expect(typesContent).toContain('initiatedBy?: string');
    expect(typesContent).toContain('requestId?: string');
  });

  it('should define ServiceActionResultData interface', () => {
    expect(typesContent).toContain('export interface ServiceActionResultData');
    expect(typesContent).toContain('pid?: number');
    expect(typesContent).toContain('uptime?: number');
    expect(typesContent).toContain('health?: string');
  });

  it('should define ServiceActionResult interface', () => {
    expect(typesContent).toContain('export interface ServiceActionResult');
    expect(typesContent).toContain('success: boolean');
    expect(typesContent).toContain('serviceId: string');
    expect(typesContent).toContain('action: ServiceAction');
    expect(typesContent).toContain('timestamp: Date');
    expect(typesContent).toContain('data?: ServiceActionResultData');
    expect(typesContent).toContain('error?: string');
  });

  it('should define ServiceJobStatus type', () => {
    expect(typesContent).toContain('export type ServiceJobStatus = "waiting" | "active" | "completed" | "failed"');
  });

  it('should define ServiceJobInfo interface', () => {
    expect(typesContent).toContain('export interface ServiceJobInfo');
    expect(typesContent).toContain('jobId: string');
    expect(typesContent).toContain('serviceId: string');
    expect(typesContent).toContain('status: ServiceJobStatus');
  });

  it('should define ServiceQueueStats interface', () => {
    expect(typesContent).toContain('export interface ServiceQueueStats');
    expect(typesContent).toContain('waiting: number');
    expect(typesContent).toContain('active: number');
    expect(typesContent).toContain('completed: number');
    expect(typesContent).toContain('delayed: number');
    expect(typesContent).toContain('failed: number');
  });
});

describe('service-queue/init.ts', () => {
  const initPath = path.join(__dirname, 'service-queue', 'init.ts');
  let initContent: string;

  beforeEach(() => {
    initContent = fs.readFileSync(initPath, 'utf-8');
  });

  it('should export initializeServiceQueue function', () => {
    expect(initContent).toContain('export async function initializeServiceQueue');
  });

  it('should export isServiceQueueInitialized function', () => {
    expect(initContent).toContain('export function isServiceQueueInitialized');
  });

  it('should have initialization guard', () => {
    expect(initContent).toContain('let initialized = false');
    expect(initContent).toContain('if (initialized)');
  });

  it('should call startServiceWorker', () => {
    expect(initContent).toContain("await startServiceWorker()");
  });
});

describe('service-queue/worker.ts', () => {
  const workerPath = path.join(__dirname, 'service-queue', 'worker.ts');
  let workerContent: string;

  beforeEach(() => {
    workerContent = fs.readFileSync(workerPath, 'utf-8');
  });

  it('should export startServiceWorker function', () => {
    expect(workerContent).toContain('export async function startServiceWorker');
  });

  it('should export stopServiceWorker function', () => {
    expect(workerContent).toContain('export async function stopServiceWorker');
  });

  it('should define queue constants', () => {
    expect(workerContent).toContain('const QUEUE_NAME = "service-actions"');
    expect(workerContent).toContain('const QUEUE_PREFIX = "bernard:queue:service-actions"');
  });

  it('should import ServiceManager', () => {
    expect(workerContent).toContain("import { ServiceManager } from");
  });

  it('should define processStart function', () => {
    expect(workerContent).toContain('async function processStart');
  });

  it('should define processStop function', () => {
    expect(workerContent).toContain('async function processStop');
  });

  it('should define processRestart function', () => {
    expect(workerContent).toContain('async function processRestart');
  });

  it('should handle worker events', () => {
    expect(workerContent).toContain("serviceWorker.on('completed'");
    expect(workerContent).toContain("serviceWorker.on('failed'");
    expect(workerContent).toContain("serviceWorker.on('error'");
    expect(workerContent).toContain("serviceWorker.on('stalled'");
  });
});

describe('service-queue/index.ts (main exports)', () => {
  const indexPath = path.join(__dirname, 'service-queue', 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export getServiceQueue function', () => {
    expect(indexContent).toContain('export async function getServiceQueue');
  });

  it('should export addServiceJob function', () => {
    expect(indexContent).toContain('export async function addServiceJob');
  });

  it('should export getServiceJobStatus function', () => {
    expect(indexContent).toContain('export async function getServiceJobStatus');
  });

  it('should export getServiceJobs function', () => {
    expect(indexContent).toContain('export async function getServiceJobs');
  });

  it('should export getAllServiceJobs function', () => {
    expect(indexContent).toContain('export async function getAllServiceJobs');
  });

  it('should export getQueueStats function', () => {
    expect(indexContent).toContain('export async function getQueueStats');
  });

  it('should export retryJob function', () => {
    expect(indexContent).toContain('export async function retryJob');
  });

  it('should export cancelJob function', () => {
    expect(indexContent).toContain('export async function cancelJob');
  });

  it('should export closeServiceQueue function', () => {
    expect(indexContent).toContain('export async function closeServiceQueue');
  });
});
