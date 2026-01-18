import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('overseerr barrel export', () => {
  const indexPath = path.join(__dirname, 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export client functions', () => {
    expect(indexContent).toContain('OverseerrClient');
    expect(indexContent).toContain('createOverseerrClient');
  });

  it('should export validation functions', () => {
    expect(indexContent).toContain('isValidOverseerrConfig');
    expect(indexContent).toContain('getOverseerrClient');
  });
});

describe('overseerr exports verification', () => {
  it('client.ts should export client class', () => {
    const clientPath = path.join(__dirname, 'client.ts');
    const clientContent = fs.readFileSync(clientPath, 'utf-8');
    
    expect(clientContent).toContain('export class OverseerrClient');
    expect(clientContent).toContain('export interface OverseerrConfig');
    expect(clientContent).toContain('export function createOverseerrClient');
  });

  it('types.ts should export type definitions', () => {
    const typesPath = path.join(__dirname, 'types.ts');
    const typesContent = fs.readFileSync(typesPath, 'utf-8');
    
    expect(typesContent).toContain('export interface MediaSearchResult');
    expect(typesContent).toContain('export interface RequestListItem');
    expect(typesContent).toContain('export const REQUEST_STATUS');
    expect(typesContent).toContain('export const ISSUE_TYPES');
  });

  it('validation.ts should export validation functions', () => {
    const valPath = path.join(__dirname, 'validation.ts');
    const valContent = fs.readFileSync(valPath, 'utf-8');
    
    expect(valContent).toContain('export function isValidOverseerrConfig');
    expect(valContent).toContain('export function getOverseerrClient');
  });
});
