/**
 * Plex Client Factory Unit Tests
 * Tests for isValidPlexConfig() and parsePlexUrl()
 */
import { describe, it, expect } from "vitest";
import { isValidPlexConfig, parsePlexUrl, type PlexConfig } from "../../src/lib/plex/client";

describe("Plex Client Factory", () => {
  describe("isValidPlexConfig", () => {
    it("should return true for valid HTTP config", () => {
      const config: PlexConfig = {
        baseUrl: "http://localhost:32400",
        token: "valid-token",
      };

      expect(isValidPlexConfig(config)).toBe(true);
    });

    it("should return true for valid HTTPS config", () => {
      const config: PlexConfig = {
        baseUrl: "https://plex.example.com",
        token: "valid-token",
      };

      expect(isValidPlexConfig(config)).toBe(true);
    });

    it("should return false for empty baseUrl", () => {
      const config = { baseUrl: "", token: "token" };

      expect(isValidPlexConfig(config)).toBe(false);
    });

    it("should return false for empty token", () => {
      const config = { baseUrl: "http://localhost", token: "" };

      expect(isValidPlexConfig(config)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isValidPlexConfig(null as unknown as Partial<PlexConfig>)).toBe(
        false,
      );
    });

    it("should return false for undefined", () => {
      expect(
        isValidPlexConfig(undefined as unknown as Partial<PlexConfig>),
      ).toBe(false);
    });

    it("should return false for invalid URL format", () => {
      const config = { baseUrl: "invalid-url", token: "token" };

      expect(isValidPlexConfig(config)).toBe(false);
    });

    it("should return false for non-string baseUrl", () => {
      const config = { baseUrl: 123 as unknown as string, token: "token" };

      expect(isValidPlexConfig(config)).toBe(false);
    });

    it("should return false for non-string token", () => {
      const config = {
        baseUrl: "http://localhost",
        token: 123 as unknown as string,
      };

      expect(isValidPlexConfig(config)).toBe(false);
    });
  });

  describe("parsePlexUrl", () => {
    it("should parse HTTP URL with port", () => {
      const result = parsePlexUrl("http://localhost:32400");

      expect(result.hostname).toBe("localhost");
      expect(result.port).toBe(32400);
      expect(result.https).toBe(false);
    });

    it("should parse HTTPS URL with port", () => {
      const result = parsePlexUrl("https://plex.example.com:32443");

      expect(result.hostname).toBe("plex.example.com");
      expect(result.port).toBe(32443);
      expect(result.https).toBe(true);
    });

    it("should use default port 32400 for HTTP without port", () => {
      const result = parsePlexUrl("http://plex.local");

      expect(result.hostname).toBe("plex.local");
      expect(result.port).toBe(32400);
      expect(result.https).toBe(false);
    });

    it("should use default port 443 for HTTPS without port", () => {
      const result = parsePlexUrl("https://plex.secure.com");

      expect(result.hostname).toBe("plex.secure.com");
      expect(result.port).toBe(443);
      expect(result.https).toBe(true);
    });

    it("should parse IP address URL", () => {
      const result = parsePlexUrl("http://192.168.1.100:32400");

      expect(result.hostname).toBe("192.168.1.100");
      expect(result.port).toBe(32400);
      expect(result.https).toBe(false);
    });

    it("should parse URL with path (ignore path)", () => {
      const result = parsePlexUrl("http://plex.local:32400/library");

      expect(result.hostname).toBe("plex.local");
      expect(result.port).toBe(32400);
      expect(result.https).toBe(false);
    });
  });
});
