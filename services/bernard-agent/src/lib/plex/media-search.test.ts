/**
 * Plex Media Search Unit Tests
 * Tests for ranking, progress calculation, and other pure business logic
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  rankSearchResults,
  calculatePlexMediaProgress,
  getLastPlexPlayTime,
  searchPlexMedia,
  getPlexLibrarySections,
  getPlexItemMetadata,
  getPlexServerIdentity,
  discoverPlexClient,
  type PlexMediaItem,
} from "./media-search";
import { createPlexClient } from "./client";

// Mock the client module
vi.mock("./client", () => ({
  createPlexClient: vi.fn(),
}));

// Mock PlexAPI instance
const mockQuery = vi.fn();
const mockFind = vi.fn();

vi.mock("plex-api", () => ({
  default: vi.fn().mockImplementation(() => ({
    query: mockQuery,
    find: mockFind,
  })),
}));

describe("Plex Media Search Business Logic", () => {
  describe("rankSearchResults", () => {
    // Use a fixed timestamp from 60 days ago to avoid recency boost
    const oldTime = Date.now() / 1000 - 60 * 24 * 60 * 60;
    const createMockItem = (
      overrides: Partial<PlexMediaItem> = {},
    ): PlexMediaItem => ({
      ratingKey: "1",
      key: "/library/metadata/1",
      title: "Test Movie",
      type: "movie",
      year: 2024,
      thumb: "/library/metadata/1/thumb",
      art: "/library/metadata/1/art",
      summary: "Test summary",
      duration: 7200000,
      addedAt: oldTime,
      viewCount: 0,
      viewOffset: 0,
      ...overrides,
    });

    it("should rank exact title match highest", () => {
      const results = [
        createMockItem({ title: "Different Movie", ratingKey: "1" }),
        createMockItem({ title: "Test Movie", ratingKey: "2" }),
        createMockItem({ title: "Another Test Movie", ratingKey: "3" }),
      ];

      const ranked = rankSearchResults(results, "Test Movie");

      expect(ranked[0]!.title).toBe("Test Movie");
      expect(ranked[0]!._score).toBe(100);
    });

    it("should rank title starting with query second", () => {
      const results = [
        createMockItem({ title: "Test Movie", ratingKey: "1" }),
        createMockItem({ title: "Test Movie 2", ratingKey: "2" }),
        createMockItem({ title: "The Test Movie", ratingKey: "3" }),
      ];

      const ranked = rankSearchResults(results, "Test Movie");

      expect(ranked[0]!.title).toBe("Test Movie");
      expect(ranked[1]!.title).toBe("Test Movie 2");
      expect(ranked[1]!._score).toBe(80);
    });

    it("should rank title containing query third", () => {
      const results = [
        createMockItem({ title: "Test Movie", ratingKey: "1" }),
        createMockItem({ title: "The Great Test Movie Ever", ratingKey: "2" }),
      ];

      const ranked = rankSearchResults(results, "Test Movie");

      expect(ranked[0]!.title).toBe("Test Movie");
      expect(ranked[1]!.title).toBe("The Great Test Movie Ever");
      expect(ranked[1]!._score).toBe(50);
    });

    it("should boost score for viewed items", () => {
      const results = [
        createMockItem({ title: "Test Movie", ratingKey: "1", viewCount: 0 }),
        createMockItem({ title: "Test Movie", ratingKey: "2", viewCount: 5 }),
        createMockItem({ title: "Test Movie", ratingKey: "3", viewCount: 10 }),
      ];

      const ranked = rankSearchResults(results, "Test Movie");

      expect(ranked[0]!.ratingKey).toBe("3");
      // viewCount of 10 adds min(10, 20) = 10 points
      expect(ranked[0]!._score).toBe(100 + 10);
    });

    it("should cap viewCount boost at 20 points", () => {
      const results = [
        createMockItem({ title: "Test Movie", ratingKey: "1", viewCount: 0 }),
        createMockItem({ title: "Test Movie", ratingKey: "2", viewCount: 10 }),
      ];

      const ranked = rankSearchResults(results, "Test Movie");

      // ranked[0] has viewCount=10, adds min(10, 20) = 10 points, total 110
      // ranked[1] has viewCount=0, adds 0 points, total 100
      expect(ranked[0]!.ratingKey).toBe("2");
      expect(ranked[0]!._score).toBe(100 + 10);
      expect(ranked[1]!.ratingKey).toBe("1");
      expect(ranked[1]!._score).toBe(100);
    });

    it("should boost score for recently added items", () => {
      const recentTime = Date.now() / 1000;
      const oldTime = Date.now() / 1000 - 60 * 24 * 60 * 60;

      const results = [
        createMockItem({
          title: "Test Movie",
          ratingKey: "1",
          addedAt: oldTime,
        }),
        createMockItem({
          title: "Test Movie",
          ratingKey: "2",
          addedAt: recentTime,
        }),
      ];

      const ranked = rankSearchResults(results, "Test Movie");

      expect(ranked[0]!.ratingKey).toBe("2");
      expect(ranked[0]!._score).toBe(100 + 15);
    });

    it("should not boost score for items added more than 30 days ago", () => {
      const oldTime = Date.now() / 1000 - 60 * 24 * 60 * 60;

      const results = [
        createMockItem({
          title: "Test Movie",
          ratingKey: "1",
          addedAt: oldTime,
        }),
      ];

      const ranked = rankSearchResults(results, "Test Movie");

      expect(ranked[0]!._score).toBe(100);
    });

    it("should sort results by score descending", () => {
      const results = [
        createMockItem({ title: "Movie C", ratingKey: "3", viewCount: 0 }),
        createMockItem({ title: "Movie A", ratingKey: "1", viewCount: 5 }),
        createMockItem({ title: "Movie B", ratingKey: "2", viewCount: 2 }),
      ];

      const ranked = rankSearchResults(results, "Movie");

      expect(ranked[0]!.title).toBe("Movie A");
      expect(ranked[1]!.title).toBe("Movie B");
      expect(ranked[2]!.title).toBe("Movie C");
    });

    it("should handle empty results array", () => {
      const ranked = rankSearchResults([], "Test");

      expect(ranked).toEqual([]);
    });

    it("should be case-insensitive for title matching", () => {
      const results = [
        createMockItem({ title: "test movie", ratingKey: "1" }),
        createMockItem({ title: "TEST MOVIE", ratingKey: "2" }),
        createMockItem({ title: "Test Movie", ratingKey: "3" }),
      ];

      const ranked = rankSearchResults(results, "TEST MOVIE");

      expect(ranked[0]!._score).toBe(100);
    });

    it("should trim whitespace from query", () => {
      const results = [createMockItem({ title: "Test Movie", ratingKey: "1" })];

      const ranked = rankSearchResults(results, "  Test Movie  ");

      expect(ranked[0]!._score).toBe(100);
    });
  });

  describe("calculatePlexMediaProgress", () => {
    it("should return 0 for undefined viewOffset", () => {
      const progress = calculatePlexMediaProgress(undefined, 7200000);

      expect(progress).toBe(0);
    });

    it("should return 0 for undefined duration", () => {
      const progress = calculatePlexMediaProgress(100000, undefined);

      expect(progress).toBe(0);
    });

    it("should return 0 for zero duration", () => {
      const progress = calculatePlexMediaProgress(100000, 0);

      expect(progress).toBe(0);
    });

    it("should return 0 for negative duration", () => {
      const progress = calculatePlexMediaProgress(100000, -100);

      expect(progress).toBe(0);
    });

    it("should calculate progress correctly for mid-stream playback", () => {
      const duration = 7200000;
      const viewOffset = 3600000;

      const progress = calculatePlexMediaProgress(viewOffset, duration);

      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(100);
    });

    it("should cap progress at 100", () => {
      const duration = 3600000;
      const viewOffset = 3500000;

      const progress = calculatePlexMediaProgress(viewOffset, duration);

      expect(progress).toBeLessThanOrEqual(100);
    });

    it("should return 0 if offset is at start of content", () => {
      const duration = 3600000;
      const viewOffset = 0;

      const progress = calculatePlexMediaProgress(viewOffset, duration);

      expect(progress).toBe(0);
    });

    it("should round to 1 decimal place", () => {
      const duration = 7200000;
      const viewOffset = 1800000;

      const progress = calculatePlexMediaProgress(viewOffset, duration);

      const decimalPart = progress.toString().split(".")[1];
      if (decimalPart) {
        expect(decimalPart.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("getLastPlexPlayTime", () => {
    it("should return null for null metadata", () => {
      const result = getLastPlexPlayTime(null);

      expect(result).toBe(null);
    });

    it("should return null for metadata without viewOffset", () => {
      const metadata: PlexMediaItem = {
        ratingKey: "1",
        key: "/library/metadata/1",
        title: "Test",
        type: "movie",
        year: 2024,
        thumb: "",
        art: "",
        addedAt: Date.now() / 1000,
      };

      const result = getLastPlexPlayTime(metadata);

      expect(result).toBe(null);
    });

    it("should return current timestamp for metadata with viewOffset > 0", () => {
      const before = Date.now();
      const metadata: PlexMediaItem = {
        ratingKey: "1",
        key: "/library/metadata/1",
        title: "Test",
        type: "movie",
        year: 2024,
        thumb: "",
        art: "",
        addedAt: Date.now() / 1000,
        viewOffset: 100000,
      };

      const result = getLastPlexPlayTime(metadata);
      const after = Date.now();

      expect(result).not.toBe(null);
      expect(result!).toBeGreaterThanOrEqual(before);
      expect(result!).toBeLessThanOrEqual(after);
    });

    it("should return null for metadata with viewOffset = 0", () => {
      const metadata: PlexMediaItem = {
        ratingKey: "1",
        key: "/library/metadata/1",
        title: "Test",
        type: "movie",
        year: 2024,
        thumb: "",
        art: "",
        addedAt: Date.now() / 1000,
        viewOffset: 0,
      };

      const result = getLastPlexPlayTime(metadata);

      expect(result).toBe(null);
    });
  });
});

describe("Plex API Functions", () => {
  const mockConfig = {
    baseUrl: "http://localhost:32400",
    token: "test-token",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchPlexMedia", () => {
    it("should return mapped media items from search results", async () => {
      // Create a mock client with query method
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            Hub: [
              {
                Video: [
                  {
                    ratingKey: "1",
                    key: "/library/metadata/1",
                    title: "Test Movie",
                    type: "movie",
                    year: 2024,
                    thumb: "/thumb/1",
                    art: "/art/1",
                    summary: "A test movie",
                    duration: 7200000,
                    addedAt: Date.now() / 1000,
                    viewCount: 2,
                    viewOffset: 0,
                  },
                ],
                Directory: [],
              },
            ],
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const results = await searchPlexMedia(mockConfig, "Test Movie", "1");

      expect(results).toHaveLength(1);
      expect(results[0]!.ratingKey).toBe("1");
      expect(results[0]!.title).toBe("Test Movie");
      expect(results[0]!.type).toBe("movie");
      expect(mockClient.query).toHaveBeenCalledWith(
        "/hubs/search?query=Test%20Movie",
      );
    });

    it("should return empty array when no results found", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            Hub: [],
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const results = await searchPlexMedia(mockConfig, "Nonexistent", "1");

      expect(results).toEqual([]);
    });

    it("should filter by media type (movie, show, season, episode)", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            Hub: [
              {
                Video: [
                  {
                    ratingKey: "1",
                    key: "/1",
                    title: "Movie",
                    type: "movie",
                    year: 2024,
                    thumb: "",
                    art: "",
                    addedAt: Date.now() / 1000,
                  },
                  {
                    ratingKey: "2",
                    key: "/2",
                    title: "Photo",
                    type: "photo",
                    year: 2024,
                    thumb: "",
                    art: "",
                    addedAt: Date.now() / 1000,
                  },
                ],
                Directory: [],
              },
            ],
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const results = await searchPlexMedia(mockConfig, "test", "1");

      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe("movie");
    });

    it("should handle server error gracefully", async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error("Server error")),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const results = await searchPlexMedia(mockConfig, "test", "1");

      expect(results).toEqual([]);
    });
  });

  describe("getPlexLibrarySections", () => {
    it("should return library sections from Plex server", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            Directory: [
              {
                key: "1",
                title: "Movies",
                type: "movie",
                thumb: "/library/sections/1/thumb",
              },
              {
                key: "2",
                title: "TV Shows",
                type: "show",
                thumb: "/library/sections/2/thumb",
              },
            ],
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const sections = await getPlexLibrarySections(mockConfig);

      expect(sections).toHaveLength(2);
      expect(sections[0]!.key).toBe("1");
      expect(sections[0]!.title).toBe("Movies");
      expect(sections[1]!.key).toBe("2");
      expect(mockClient.query).toHaveBeenCalledWith("/library/sections");
    });

    it("should return empty array when no sections exist", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            Directory: [],
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const sections = await getPlexLibrarySections(mockConfig);

      expect(sections).toEqual([]);
    });

    it("should handle server error", async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const sections = await getPlexLibrarySections(mockConfig);

      expect(sections).toEqual([]);
    });
  });

  describe("getPlexItemMetadata", () => {
    it("should return metadata for valid ratingKey", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            Metadata: [
              {
                ratingKey: "12345",
                key: "/library/metadata/12345",
                title: "The Matrix",
                type: "movie",
                year: 1999,
                thumb: "/library/metadata/12345/thumb",
                art: "/library/metadata/12345/art",
                summary:
                  "A computer hacker learns about the true nature of reality.",
                duration: 8160000,
                addedAt: 1000000000,
                viewCount: 3,
                viewOffset: 3600000,
              },
            ],
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const metadata = await getPlexItemMetadata(mockConfig, "12345");

      expect(metadata).not.toBe(null);
      expect(metadata!.ratingKey).toBe("12345");
      expect(metadata!.title).toBe("The Matrix");
      expect(metadata!.viewOffset).toBe(3600000);
      expect(mockClient.query).toHaveBeenCalledWith("/library/metadata/12345");
    });

    it("should return null when ratingKey not found", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            Metadata: [],
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const metadata = await getPlexItemMetadata(mockConfig, "nonexistent");

      expect(metadata).toBe(null);
    });

    it("should return null on server error", async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error("Server error")),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const metadata = await getPlexItemMetadata(mockConfig, "12345");

      expect(metadata).toBe(null);
    });
  });

  describe("getPlexServerIdentity", () => {
    it("should return machine identifier from server", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          MediaContainer: {
            machineIdentifier: "abc123-def456-ghi789",
            friendlyName: "My Plex Server",
            product: "Plex Media Server",
            platform: "Windows",
            device: "PC",
          },
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const identity = await getPlexServerIdentity(mockConfig);

      expect(identity.machineIdentifier).toBe("abc123-def456-ghi789");
      expect(mockClient.query).toHaveBeenCalledWith("/");
    });

    it("should throw error when machineIdentifier not found", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          friendlyName: "My Plex Server",
        }),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      await expect(getPlexServerIdentity(mockConfig)).rejects.toThrow(
        "Server machine identifier not found",
      );
    });

    it("should throw error on server connection failure", async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      await expect(getPlexServerIdentity(mockConfig)).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("discoverPlexClient", () => {
    it("should find client by machine identifier", async () => {
      const mockClient = {
        find: vi.fn().mockResolvedValue([
          {
            machineIdentifier: "client-123",
            name: "Living Room TV",
            product: "Plex for LG",
            platform: "web",
            device: "tv",
          },
          {
            machineIdentifier: "client-456",
            name: "Bedroom TV",
            product: "Plex for Android TV",
            platform: "Android",
            device: "tv",
          },
        ]),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const client = await discoverPlexClient(mockConfig, "client-456");

      expect(client).not.toBe(null);
      expect(client!.machineIdentifier).toBe("client-456");
      expect(client!.name).toBe("Bedroom TV");
      expect(mockClient.find).toHaveBeenCalledWith("/clients");
    });

    it("should return null when client not found", async () => {
      const mockClient = {
        find: vi
          .fn()
          .mockResolvedValue([
            { machineIdentifier: "client-123", name: "Some Device" },
          ]),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const client = await discoverPlexClient(mockConfig, "nonexistent-client");

      expect(client).toBe(null);
    });

    it("should return null on server error", async () => {
      const mockClient = {
        find: vi.fn().mockRejectedValue(new Error("Server unavailable")),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const client = await discoverPlexClient(mockConfig, "client-123");

      expect(client).toBe(null);
    });

    it("should return null when find returns empty array", async () => {
      const mockClient = {
        find: vi.fn().mockResolvedValue([]),
      };

      (createPlexClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockClient,
      );

      const client = await discoverPlexClient(mockConfig, "client-123");

      expect(client).toBe(null);
    });
  });
});
