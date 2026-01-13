/**
 * Tests for the Overseerr find media tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findMediaStatusToolFactory,
  type OverseerrDependencies,
} from './overseerr-find-media.tool';
import type { BernardSettings } from '@/lib/config/settingsStore';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';
import { logger } from '@/lib/logging';

vi.mock('@/lib/config/settingsCache');
vi.mock('@/lib/overseerr/validation');
vi.mock('@/lib/logging');

// Get mocked functions
const mockGetSettings = vi.mocked(getSettings);
const mockGetOverseerrClient = vi.mocked(getOverseerrClient);
const mockLogger = vi.mocked(logger);

describe('findMediaStatusToolFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a factory function', () => {
    const factory = findMediaStatusToolFactory;

    expect(typeof factory).toBe('function');
  });

  it('should return ToolFactoryResult with ok=true when configured', async () => {
    const mockGetMovie = vi.fn().mockResolvedValue({
      movie: { id: 123, title: 'Test Movie', status: 'available' },
    });

    mockGetSettings.mockResolvedValue({
      services: { overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test' } },
    } as unknown as BernardSettings);
    mockGetOverseerrClient.mockReturnValue({
      ok: true,
      client: {
        getMovie: mockGetMovie,
        getTvShow: vi.fn(),
        search: vi.fn(),
        requestMedia: vi.fn(),
        deleteRequest: vi.fn(),
      } as any,
    });

    const result = await findMediaStatusToolFactory();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('find_media_status');
    }
  });

  it('should return ToolFactoryResult with ok=false when Overseerr not configured', async () => {
    mockGetSettings.mockResolvedValue({
      services: { overseerr: null },
    } as unknown as BernardSettings);
    mockGetOverseerrClient.mockReturnValue({
      ok: false,
      reason: 'Overseerr not configured',
    });

    const result = await findMediaStatusToolFactory();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.name).toBe('find_media_status');
      expect(result.reason).toBe('Overseerr not configured');
    }
  });

  it('should create tool when Overseerr is configured', async () => {
    const mockGetMovie = vi.fn().mockResolvedValue({
      movie: { id: 123, title: 'Test Movie', status: 'available' },
    });

    mockGetSettings.mockResolvedValue({
      services: { overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test' } },
    } as unknown as BernardSettings);
    mockGetOverseerrClient.mockReturnValue({
      ok: true,
      client: {
        getMovie: mockGetMovie,
        getTvShow: vi.fn(),
        search: vi.fn(),
        requestMedia: vi.fn(),
        deleteRequest: vi.fn(),
      } as any,
    });

    const result = await findMediaStatusToolFactory();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('find_media_status');
    }
  });
});


describe('OverseerrDependencies type', () => {
  it('should accept valid dependencies object', () => {
    const deps: OverseerrDependencies = {
      fetchSettings: vi.fn().mockResolvedValue({} as BernardSettings),
      getOverseerrClient: vi.fn(),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
      } as any,
    };

    expect(deps.fetchSettings).toBeDefined();
    expect(deps.getOverseerrClient).toBeDefined();
    expect(deps.logger).toBeDefined();
  });
});