/**
 * Overseerr API Client
 * Direct REST API client for Overseerr media management
 */

export interface OverseerrConfig {
  baseUrl: string;  // e.g., "http://localhost:5055/api/v1"
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

    return this.request('POST', '/request', body);
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
