import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('logging barrel export', () => {
  const indexPath = path.join(__dirname, 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export logger instance', () => {
    expect(indexContent).toContain('logger');
    expect(indexContent).toMatch(/export\s*\{\s*.*logger.*\s*\}/);
  });

  it('should export logger functions', () => {
    expect(indexContent).toContain('childLogger');
    expect(indexContent).toContain('ensureRequestId');
    expect(indexContent).toContain('startTimer');
    expect(indexContent).toContain('toErrorObject');
  });

  it('should export context utilities', () => {
    expect(indexContent).toContain('withLogContext');
    expect(indexContent).toContain('withRequestContext');
    expect(indexContent).toContain('elapsedTimer');
  });

  it('should export LogContext type', () => {
    expect(indexContent).toContain('export type { LogContext }');
  });
});

describe('logging exports verification', () => {
  it('logger.ts should export logger functions', () => {
    const loggerPath = path.join(__dirname, 'logger.ts');
    const loggerContent = fs.readFileSync(loggerPath, 'utf-8');
    
    expect(loggerContent).toContain('export const logger');
    expect(loggerContent).toContain('export function childLogger');
    expect(loggerContent).toContain('export function ensureRequestId');
    expect(loggerContent).toContain('export function startTimer');
    expect(loggerContent).toContain('export function toErrorObject');
    expect(loggerContent).toContain('export const redactionPaths');
    expect(loggerContent).toContain('export type LogContext');
  });

  it('context.ts should export context functions', () => {
    const ctxPath = path.join(__dirname, 'context.ts');
    const ctxContent = fs.readFileSync(ctxPath, 'utf-8');
    
    expect(ctxContent).toContain('export function withLogContext');
    expect(ctxContent).toContain('export function withRequestContext');
    expect(ctxContent).toContain('export function elapsedTimer');
    expect(ctxContent).toContain('export type CorrelationIds');
  });
});
