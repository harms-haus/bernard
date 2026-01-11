# Overseerr Tools Implementation Plan

**Generated:** January 11, 2026  
**Status:** Plan - Ready for Implementation  
**Author:** Bernard AI Agent

## Overview

This plan outlines the implementation of five Overseerr integration tools for the Bernard AI agent. Overseerr is a media request management system that integrates with Plex, Sonarr, and Radarr. The tools will enable Bernard to search for media, request new content, list existing requests, cancel requests, and report issues.

### No External Libraries Required

After research, we will use the **REST API directly** rather than any third-party library because:
1. Overseerr has a well-documented REST API with OpenAPI specification
2. Existing libraries (overseerr-py, overseerr-go, overseerr-rs) are either unmaintained or don't provide TypeScript/Node.js support
3. The Bernard codebase already follows a pattern of direct HTTP calls (e.g., Weather service uses native fetch)
4. Authentication via API key is straightforward to implement

---

## API Endpoints Reference

Based on [Overseerr API Documentation](https://api-docs.overseerr.dev/):

| Tool | Method | Endpoint | Description |
|------|--------|----------|-------------|
| `find_media_status` | GET | `/search?query={query}` | Search movies/shows |
| `find_media_status` | GET | `/movie/{id}` or `/tv/{id}` | Get media status details |
| `request_media` | POST | `/api/v1/request` | Request new media |
| `list_media_requests` | GET | `/request` | List all requests with pagination |
| `cancel_media_request` | DELETE | `/request/{requestId}` | Cancel a request |
| `report_media_issue` | POST | `/issue` | Report missing/broken media |

### Authentication

Two methods supported:
1. **API Key Authentication**: `X-Api-Key` header with Overseerr API key
2. **Cookie Authentication**: Via Plex sign-in (not recommended for agent)

**Decision**: Use **API Key Authentication** via `X-Api-Key` header.

---

## Architecture

### Directory Structure

```
core/src/
├── agents/bernard/tools/
│   ├── index.ts                    # Registry - add exports
│   ├── overseerr-find-media.tool.ts
│   ├── overseerr-request-media.tool.ts
│   ├── overseerr-list-requests.tool.ts
│   ├── overseerr-cancel-request.tool.ts
│   └── overseerr-report-issue.tool.ts
└── lib/
    └── overseerr/
        ├── index.ts               # Barrel export
        ├── client.ts              # Overseerr API client
        ├── types.ts               # TypeScript types
        └── validation.ts          # Schema validation
```

### Dependencies to Add

None - using native `fetch` API (available in Node.js 18+).

---

## Implementation Steps

### Step 1: Add Overseerr Configuration Schema

**File:** `core/src/lib/config/appSettings.ts`

Add `OverseerrServiceSchema` following the existing pattern:

```typescript
const OverseerrServiceSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1)
});

export type OverseerrServiceSettings = {
  baseUrl: string;
  apiKey: string;
};

// Add to ServicesSettingsSchema:
export const ServicesSettingsSchema = z.object({
  // ... existing services
  overseerr: OverseerrServiceSchema.optional(),
});

// Add to ServicesSettings type:
export type ServicesSettings = {
  // ... existing types
  overseerr?: OverseerrServiceSettings | undefined;
};
```

**Status:** Required for tool configuration

---

### Step 2: Create Overseerr API Client

**File:** `core/src/lib/overseerr/client.ts`

```typescript
/**
 * Overseerr API Client
 * Direct REST API client for Overseerr media management
 */

export interface OverseerrConfig {
  baseUrl: string;  // e.g., "http://localhost:5055"
  apiKey: string;
}

export interface OverseerrMediaItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview?: string;
  posterPath?: string;
  releaseDate?: string;
  status?: string;  // requested, pending, approved, available, etc.
}

export interface OverseerrRequest {
  id: number;
  mediaId: number;
  mediaType: 'movie' | 'tv';
  status: 'pending' | 'approved' | 'declined' | 'failed' | 'available';
  requestedBy: {
    id: number;
    username: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface OverseerrIssue {
  id: number;
  issueType: number;  // 1 = missing, 2 = broken, etc.
  message: string;
  mediaId: number;
  status: 'open' | 'resolved';
  createdAt: string;
}

export class OverseerrClient {
  private config: OverseerrConfig;
  private baseUrl: string;

  constructor(config: OverseerrConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');  // Remove trailing slash
  }

  /**
   * Make authenticated request to Overseerr API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'X-Api-Key': this.config.apiKey,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Overseerr API error (${response.status}): ${errorText}`);
    }

    // DELETE returns 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // --- Search Methods ---

  /**
   * Search for movies and TV shows
   */
  async search(query: string, page = 1): Promise<{ results: OverseerrMediaItem[] }> {
    return this.request('GET', `/search?query=${encodeURIComponent(query)}&page=${page}`);
  }

  /**
   * Get movie details by ID
   */
  async getMovie(id: number): Promise<{ movie: OverseerrMediaItem & Record<string, unknown> }> {
    return this.request('GET', `/movie/${id}`);
  }

  /**
   * Get TV show details by ID
   */
  async getTvShow(id: number): Promise<{ tvShow: OverseerrMediaItem & Record<string, unknown> }> {
    return this.request('GET', `/tv/${id}`);
  }

  // --- Request Methods ---

  /**
   * Request a movie or TV show
   */
  async createRequest(params: {
    mediaId: number;
    mediaType: 'movie' | 'tv';
    is4k?: boolean;
    seasons?: number[];  // For TV shows, specify seasons
  }): Promise<OverseerrRequest> {
    const body: Record<string, unknown> = {
      mediaId: params.mediaId,
      mediaType: params.mediaType,
    };

    if (params.is4k !== undefined) {
      body.is4k = params.is4k;
    }

    if (params.seasons && params.seasons.length > 0) {
      body.seasons = params.seasons;
    }

    return this.request('POST', '/api/v1/request', body);
  }

  /**
   * List media requests with pagination and filtering
   */
  async listRequests(params: {
    take?: number;      // Limit (default: 20)
    skip?: number;      // Offset
    filter?: string;    // all, pending, approved, declined, available
    sort?: string;      // added, modified
    requestedBy?: number;  // Filter by user ID
  }): Promise<{ pageInfo: { totalResults: number }; results: OverseerrRequest[] }> {
    const queryParams = new URLSearchParams();
    
    if (params.take) queryParams.set('take', String(params.take));
    if (params.skip) queryParams.set('skip', String(params.skip));
    if (params.filter) queryParams.set('filter', params.filter);
    if (params.sort) queryParams.set('sort', params.sort);
    if (params.requestedBy) queryParams.set('requestedBy', String(params.requestedBy));

    const query = queryParams.toString();
    return this.request('GET', `/request${query ? `?${query}` : ''}`);
  }

  /**
   * Cancel a request by ID
   */
  async deleteRequest(requestId: number): Promise<void> {
    await this.request('DELETE', `/request/${requestId}`);
  }

  // --- Issue Methods ---

  /**
   * Report an issue with media
   * Issue types: 1 = missing, 2 = broken, 3 = wrong, 4 = other
   */
  async createIssue(params: {
    mediaId: number;
    issueType: number;
    message: string;
  }): Promise<OverseerrIssue> {
    return this.request('POST', '/issue', {
      mediaId: params.mediaId,
      issueType: params.issueType,
      message: params.message,
    });
  }
}

/**
 * Create Overseerr client from settings
 */
export function createOverseerrClient(
  settings?: { baseUrl: string; apiKey: string }
): OverseerrClient | null {
  if (!settings?.baseUrl || !settings?.apiKey) {
    return null;
  }

  return new OverseerrClient({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
  });
}
```

---

### Step 3: Create TypeScript Types

**File:** `core/src/lib/overseerr/types.ts`

```typescript
/**
 * Overseerr Types - Shared across all tools
 */

// Tool parameter types
export interface FindMediaStatusParams {
  type: 'movie' | 'show';
  filter?: string;  // Regex pattern for filtering results
}

export interface RequestMediaParams {
  type: 'movie' | 'show';
  media: string;  // Numeric ID as string
  is4k?: boolean;
  seasons?: number[];
}

export interface ListMediaRequestsParams {
  limit?: number;
  offset?: number;
  filter?: string;  // Regex pattern
}

export interface CancelMediaRequestParams {
  request: string;  // Request ID as string
}

export interface ReportMediaIssueParams {
  media: string;  // Media ID as string
  comment: string;
}

// Response types for tools
export interface MediaSearchResult {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview?: string;
  releaseDate?: string;
  status?: string;
  posterPath?: string;
}

export interface RequestListItem {
  id: number;
  mediaId: number;
  mediaType: 'movie' | 'tv';
  title?: string;
  status: string;
  requestedAt: string;
  completedAt?: string;
  requestedBy: string;
}

export interface IssueResult {
  id: number;
  mediaId: number;
  issueType: number;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

// Issue type constants
export const ISSUE_TYPES = {
  MISSING: 1,
  BROKEN: 2,
  WRONG: 3,
  OTHER: 4,
} as const;

// Request status constants
export const REQUEST_STATUS = {
  ALL: 'all',
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  AVAILABLE: 'available',
  FAILED: 'failed',
} as const;
```

---

### Step 4: Create Tool Validation Helper

**File:** `core/src/lib/overseerr/validation.ts`

```typescript
/**
 * Overseerr Tool Validation
 */
import { z } from 'zod';
import type { OverseerrServiceSettings } from '@/lib/config/appSettings';
import { createOverseerrClient } from './client';
import type { OverseerrClient } from './client';

/**
 * Validate Overseerr configuration
 */
export function isValidOverseerrConfig(
  config: OverseerrServiceSettings | undefined
): config is OverseerrServiceSettings {
  if (!config) return false;
  try {
    new URL(config.baseUrl);
    if (!config.apiKey || typeof config.apiKey !== 'string') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Create Overseerr client with validation
 */
export function getOverseerrClient(
  settings: OverseerrServiceSettings | undefined
): { ok: true; client: OverseerrClient } | { ok: false; reason: string } {
  if (!settings) {
    return { ok: false, reason: 'Overseerr service is not configured' };
  }

  if (!isValidOverseerrConfig(settings)) {
    return { ok: false, reason: 'Invalid Overseerr configuration' };
  }

  const client = createOverseerrClient(settings);
  if (!client) {
    return { ok: false, reason: 'Failed to create Overseerr client' };
  }

  return { ok: true, client };
}
```

---

### Step 5: Create Barrel Export

**File:** `core/src/lib/overseerr/index.ts`

```typescript
/**
 * Overseerr Library - Barrel Export
 */
export { OverseerrClient, createOverseerrClient } from './client';
export * from './types';
export { isValidOverseerrConfig, getOverseerrClient } from './validation';
```

---

### Step 6: Create Tool Implementations

#### 6.1 Find Media Status Tool

**File:** `core/src/agents/bernard/tools/overseerr-find-media.tool.ts`

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';
import type { OverseerrClient } from '@/lib/overseerr/client';
import { logger } from '@/lib/logging';

const TOOL_NAME = 'find_media_status';

/**
 * Dependencies for find media status
 */
export type FindMediaStatusDependencies = {
  searchOverseerr: OverseerrClient['search'];
  getMovieOverseerr: OverseerrClient['getMovie'];
  getTvShowOverseerr: OverseerrClient['getTvShow'];
};

function createFindMediaStatusTool(overrides: Partial<FindMediaStatusDependencies> = {}) {
  return tool(
    async (
      { type, filter }: { type: 'movie' | 'show'; filter?: string },
      _config
    ) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      try {
        // If filter is a numeric ID, get specific media
        if (/^\d+$/.test(filter || '')) {
          const id = parseInt(filter!, 10);
          const method = type === 'movie' ? 'getMovieOverseerr' : 'getTvShowOverseerr';
          const response = await (client as unknown as Record<string, (id: number) => Promise<unknown>>)[method](id);
          
          const media = type === 'movie' 
            ? (response as { movie: Record<string, unknown> }).movie
            : (response as { tvShow: Record<string, unknown> }).tvShow;

          return `Media Details (${type}):\n\n` +
            `Title: ${media.title}\n` +
            `ID: ${media.id}\n` +
            `Status: ${media.status || 'unknown'}\n` +
            `Overview: ${media.overview || 'N/A'}`;
        }

        // Otherwise, search for media
        const searchResults = await client.search(filter || '', 1);
        
        // Filter by type if specified
        const filteredResults = searchResults.results.filter(
          (item) => item.mediaType === type
        );

        // Apply regex filter if provided
        const regex = filter ? new RegExp(filter, 'i') : null;
        const finalResults = regex
          ? filteredResults.filter(item => regex.test(item.title))
          : filteredResults;

        if (finalResults.length === 0) {
          return `No ${type}s found matching "${filter || '(all)'}"`;
        }

        const output = finalResults.slice(0, 10).map((item, index) => {
          const lines = [
            `${index + 1}. ${item.title} (${item.releaseDate?.split('-')[0] || 'N/A'})`,
            `   ID: ${item.id} | Type: ${item.mediaType}`,
            `   Status: ${item.status || 'available'}`,
          ];
          if (item.overview) {
            lines.push(`   Overview: ${item.overview.slice(0, 100)}...`);
          }
          return lines.join('\n');
        }).join('\n\n');

        return `${type === 'movie' ? 'Movies' : 'TV Shows'} matching "${filter || '(all)'}":\n\n${output}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('find_media_status failed: %s', errorMessage);
        return `Error searching media: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Search for movies or TV shows in Overseerr to check availability and status. 
        - Use filter parameter to search by title OR provide a numeric ID to get specific media details
        - Type parameter specifies whether to search movies or TV shows
        - Returns availability status, overview, and metadata`,
      schema: z.object({
        type: z.enum(['movie', 'show']).describe('Type of media to search for'),
        filter: z.string().optional().describe('Search query (title) or media ID number')
      })
    }
  );
}

export const findMediaStatusToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createFindMediaStatusTool();
  return { ok: true, tool, name: tool.name };
};
```

#### 6.2 Request Media Tool

**File:** `core/src/agents/bernard/tools/overseerr-request-media.tool.ts`

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';

const TOOL_NAME = 'request_media';

export function createRequestMediaTool() {
  return tool(
    async (
      { type, media, is4k, seasons }: { 
        type: 'movie' | 'show'; 
        media: string; 
        is4k?: boolean;
        seasons?: number[];
      },
      _config
    ) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      // Validate media ID
      const mediaId = parseInt(media, 10);
      if (isNaN(mediaId)) {
        return `Error: Invalid media ID "${media}". Must be a number.`;
      }

      // Validate seasons for TV shows
      if (type === 'show' && seasons && seasons.length > 0) {
        const invalidSeasons = seasons.filter(s => !Number.isInteger(s) || s < 1);
        if (invalidSeasons.length > 0) {
          return `Error: Invalid season numbers: ${invalidSeasons.join(', ')}. Seasons must be positive integers.`;
        }
      }

      try {
        const request = await client.createRequest({
          mediaId,
          mediaType: type,
          is4k,
          seasons: type === 'show' ? seasons : undefined,
        });

        let message = `Successfully requested ${type} (ID: ${mediaId})\n`;
        message += `Request ID: ${request.id}\n`;
        message += `Status: ${request.status}\n`;
        message += `Requested by: ${request.requestedBy.username}`;
        
        if (is4k) {
          message += '\n4K version requested';
        }
        
        if (seasons && seasons.length > 0) {
          message += `\nSeasons requested: ${seasons.join(', ')}`;
        }

        return message;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error requesting media: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Request a movie or TV show through Overseerr.
        - Requires the numeric media ID (search first with find_media_status)
        - Optionally request 4K version or specific seasons for TV shows
        - Request will go through approval workflow if configured`,
      schema: z.object({
        type: z.enum(['movie', 'show']).describe('Type of media to request'),
        media: z.string().describe('Numeric media ID (get this from find_media_status)'),
        is4k: z.boolean().optional().describe('Request 4K version if available'),
        seasons: z.array(z.number()).optional().describe('For TV shows: specific seasons to request')
      })
    }
  );
}

export const requestMediaToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createRequestMediaTool();
  return { ok: true, tool, name: tool.name };
};
```

#### 6.3 List Media Requests Tool

**File:** `core/src/agents/bernard/tools/overseerr-list-requests.tool.ts`

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';
import { REQUEST_STATUS } from '@/lib/overseerr/types';

const TOOL_NAME = 'list_media_requests';

export function createListMediaRequestsTool() {
  return tool(
    async (
      { limit = 20, offset = 0, filter }: { 
        limit?: number; 
        offset?: number; 
        filter?: string;
      },
      _config
    ) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      // Validate and normalize filter
      const validFilters = Object.values(REQUEST_STATUS);
      let statusFilter: string | undefined;
      
      if (filter) {
        const normalizedFilter = filter.toLowerCase();
        const matchedFilter = validFilters.find(f => f === normalizedFilter);
        if (matchedFilter) {
          statusFilter = matchedFilter;
        }
        // If no exact match, pass as-is (might be handled by server or ignored)
      }

      try {
        const response = await client.listRequests({
          take: Math.max(1, Math.min(50, limit || 20)),
          skip: Math.max(0, offset || 0),
          filter: statusFilter,
        });

        const requests = response.results;
        
        if (requests.length === 0) {
          return `No media requests found${filter ? ` with status "${filter}"` : ''}.`;
        }

        const output = requests.map((req, index) => {
          const lines = [
            `${(response.pageInfo.totalResults - (offset || 0) - index)}. ${req.mediaType === 'movie' ? 'Movie' : 'Show'} (ID: ${req.mediaId})`,
            `   Request ID: ${req.id} | Status: ${req.status}`,
            `   Requested: ${new Date(req.createdAt).toLocaleString()}`,
            `   By: ${req.requestedBy.username}`,
          ];
          if (req.updatedAt && req.updatedAt !== req.createdAt) {
            lines.push(`   Updated: ${new Date(req.updatedAt).toLocaleString()}`);
          }
          return lines.join('\n');
        }).join('\n\n');

        const statusText = filter ? ` with status "${filter}"` : '';
        const rangeText = offset > 0 
          ? ` (showing ${offset + 1}-${offset + requests.length} of ${response.pageInfo.totalResults})`
          : ` (showing 1-${requests.length} of ${response.pageInfo.totalResults})`;

        return `Media Requests${statusText}${statusText ? '' : ' (all)'}:${rangeText}\n\n${output}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error listing requests: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `List media requests from Overseerr with pagination.
        - limit: Number of results to return (1-50, default: 20)
        - offset: Number of results to skip (for pagination)
        - filter: Filter by status (all, pending, approved, declined, available, failed)
        - Returns request ID, status, timestamp, and requester information`,
      schema: z.object({
        limit: z.number().optional().default(20).describe('Number of results to return (1-50)'),
        offset: z.number().optional().default(0).describe('Number of results to skip for pagination'),
        filter: z.string().optional().describe('Filter by status: all, pending, approved, declined, available, failed')
      })
    }
  );
}

export const listMediaRequestsToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createListMediaRequestsTool();
  return { ok: true, tool, name: tool.name };
};
```

#### 6.4 Cancel Media Request Tool

**File:** `core/src/agents/bernard/tools/overseerr-cancel-request.tool.ts`

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';

const TOOL_NAME = 'cancel_media_request';

export function createCancelMediaRequestTool() {
  return tool(
    async ({ request }: { request: string }, _config) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      // Validate request ID
      const requestId = parseInt(request, 10);
      if (isNaN(requestId)) {
        return `Error: Invalid request ID "${request}". Must be a number.`;
      }

      try {
        await client.deleteRequest(requestId);
        return `Successfully cancelled request ID: ${requestId}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Provide more helpful error messages
        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          return `Error: Request ID ${requestId} not found or has already been processed.`;
        }
        if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
          return `Error: You don't have permission to cancel this request. Only pending requests can be cancelled by the requester.`;
        }
        
        return `Error cancelling request: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Cancel a media request in Overseerr by request ID.
        - Only pending requests can be cancelled by the requester
        - Admins with MANAGE_REQUESTS permission can cancel any request
        - Use list_media_requests to get the request ID first`,
      schema: z.object({
        request: z.string().describe('Request ID to cancel (get this from list_media_requests)')
      })
    }
  );
}

export const cancelMediaRequestToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createCancelMediaRequestTool();
  return { ok: true, tool, name: tool.name };
};
```

#### 6.5 Report Media Issue Tool

**File:** `core/src/agents/bernard/tools/overseerr-report-issue.tool.ts`

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';
import { ISSUE_TYPES } from '@/lib/overseerr/types';

const TOOL_NAME = 'report_media_issue';

export function createReportMediaIssueTool() {
  return tool(
    async (
      { media, comment }: { media: string; comment: string },
      _config
    ) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      // Validate media ID
      const mediaId = parseInt(media, 10);
      if (isNaN(mediaId)) {
        return `Error: Invalid media ID "${media}". Must be a number.`;
      }

      // Validate comment
      if (!comment || comment.trim().length === 0) {
        return `Error: Issue comment is required.`;
      }

      // Determine issue type from comment keywords
      let issueType = ISSUE_TYPES.OTHER;
      const lowerComment = comment.toLowerCase();
      
      if (lowerComment.includes('missing') || lowerComment.includes('not found')) {
        issueType = ISSUE_TYPES.MISSING;
      } else if (lowerComment.includes('broken') || lowerComment.includes('not playing') || lowerComment.includes('corrupt')) {
        issueType = ISSUE_TYPES.BROKEN;
      } else if (lowerComment.includes('wrong') || lowerComment.includes('incorrect')) {
        issueType = ISSUE_TYPES.WRONG;
      }

      try {
        const issue = await client.createIssue({
          mediaId,
          issueType,
          message: comment,
        });

        return `Successfully reported issue for media ID: ${mediaId}\n` +
          `Issue ID: ${issue.id}\n` +
          `Type: ${getIssueTypeName(issue.issueType)}\n` +
          `Status: ${issue.status}\n` +
          `Created: ${new Date(issue.createdAt).toLocaleString()}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error reporting issue: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Report an issue with media in Overseerr (missing, broken, wrong metadata, etc.).
        - Issue type is automatically determined from comment keywords
        - Common issue types: missing, broken, wrong, other
        - Requires media ID (get from find_media_status or list_media_requests)`,
      schema: z.object({
        media: z.string().describe('Media ID to report issue for'),
        comment: z.string().describe('Description of the issue (keywords like "missing", "broken" auto-detect type)')
      })
    }
  );
}

function getIssueTypeName(type: number): string {
  switch (type) {
    case 1: return 'Missing';
    case 2: return 'Broken';
    case 3: return 'Wrong';
    default: return 'Other';
  }
}

export const reportMediaIssueToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createReportMediaIssueTool();
  return { ok: true, tool, name: tool.name };
};
```

---

### Step 7: Update Tool Registry

**File:** `core/src/agents/bernard/tools/index.ts`

Add exports for the new tools:

```typescript
// Add to exports section:
// Overseerr Tools
export { findMediaStatusToolFactory } from "./overseerr-find-media.tool";
export { requestMediaToolFactory } from "./overseerr-request-media.tool";
export { listMediaRequestsToolFactory } from "./overseerr-list-requests.tool";
export { cancelMediaRequestToolFactory } from "./overseerr-cancel-request.tool";
export { reportMediaIssueToolFactory } from "./overseerr-report-issue.tool";
```

---

### Step 8: Environment Configuration

Add to environment configuration file (`.env.example` or equivalent):

```bash
# Overseerr Configuration
OVERSEERR_URL=http://localhost:5055
OVERSEERR_API_KEY=your-overseerr-api-key
```

---

## Testing Strategy

### Unit Tests

Create test files for each tool following the existing pattern in `core/src/lib/`:

1. `overseerr/client.test.ts` - Test API client methods
2. `overseerr/validation.test.ts` - Test validation functions
3. `overseerr-find-media.tool.test.ts` - Test find media tool
4. `overseerr-request-media.tool.test.ts` - Test request media tool
5. `overseerr-list-requests.tool.test.ts` - Test list requests tool
6. `overseerr-cancel-request.tool.test.ts` - Test cancel request tool
7. `overseerr-report-issue.tool.test.ts` - Test report issue tool

### Integration Tests

Test against a real Overseerr instance when available:
- Full workflow: search → request → list → cancel
- Error handling: invalid IDs, missing permissions, network errors

---

## Error Handling

### Known Error Scenarios

| Scenario | Error Code | User-Friendly Message |
|----------|------------|----------------------|
| Invalid media ID | 400/404 | "Media not found" |
| Request already processed | 400 | "Request has already been approved/declined" |
| Insufficient permissions | 403 | "You don't have permission to perform this action" |
| Rate limiting | 429 | "Too many requests. Please try again later." |
| Network error | - | "Cannot connect to Overseerr. Check server configuration." |

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `core/src/lib/overseerr/client.ts` | Overseerr REST API client |
| `core/src/lib/overseerr/types.ts` | TypeScript type definitions |
| `core/src/lib/overseerr/validation.ts` | Configuration validation |
| `core/src/lib/overseerr/index.ts` | Barrel export |
| `core/src/agents/bernard/tools/overseerr-find-media.tool.ts` | Find media status tool |
| `core/src/agents/bernard/tools/overseerr-request-media.tool.ts` | Request media tool |
| `core/src/agents/bernard/tools/overseerr-list-requests.tool.ts` | List requests tool |
| `core/src/agents/bernard/tools/overseerr-cancel-request.tool.ts` | Cancel request tool |
| `core/src/agents/bernard/tools/overseerr-report-issue.tool.ts` | Report issue tool |

### Modified Files

| File | Change |
|------|--------|
| `core/src/lib/config/appSettings.ts` | Add OverseerrServiceSchema and types |
| `core/src/agents/bernard/tools/index.ts` | Add exports for new tools |

---

## Estimated Effort

| Task | Complexity | Estimated Time |
|------|------------|----------------|
| Configuration schema | Low | 30 minutes |
| API client implementation | Medium | 2 hours |
| Tool implementations (5 tools) | Medium | 4-5 hours |
| Testing | Medium | 3-4 hours |
| Integration validation | Low | 1 hour |
| **Total** | - | **~10-12 hours** |

---

## Follow-up Tasks

After implementation:
1. Add Overseerr service to `ServiceConfig.ts` if auto-start is desired
2. Update documentation in `AGENTS.md` to include new tools
3. Consider adding health check endpoint for Overseerr service
4. Add rate limiting if Overseerr instance has strict rate limits

---

## References

- [Overseerr API Documentation](https://api-docs.overseerr.dev/)
- [Overseerr GitHub Repository](https://github.com/sct/overseerr)
- Existing tool patterns: `play_media_tv.tool.ts`, `search_media.tool.ts`
- Configuration pattern: `appSettings.ts` (PlexServiceSchema)
