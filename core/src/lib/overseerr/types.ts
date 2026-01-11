/**
 * Overseerr Types - Shared across all tools
 */

// Tool parameter types
export interface FindMediaStatusParams {
  type: 'movie' | 'tv';
  filter?: string;
}

export interface RequestMediaParams {
  type: 'movie' | 'tv';
  media: string;
  is4k?: boolean;
  seasons?: number[];
}

export interface ListMediaRequestsParams {
  limit?: number;
  offset?: number;
  filter?: string;
}

export interface CancelMediaRequestParams {
  request: string;
}

export interface ReportMediaIssueParams {
  media: string;
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
  MISSING: 1 as const,
  BROKEN: 2 as const,
  WRONG: 3 as const,
  OTHER: 4 as const,
};

// Request status constants
export const REQUEST_STATUS = {
  ALL: 'all',
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  AVAILABLE: 'available',
  FAILED: 'failed',
} as const;
