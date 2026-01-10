/**
 * Plex API Client Factory
 * Creates configured Plex API client instances using node-plex-api library.
 */
import PlexAPI from 'plex-api'

/** Plex configuration interface */
export interface PlexConfig {
  baseUrl: string;
  token: string;
}

/**
 * Create a configured Plex API client instance
 * @param plexConfig - Plex server configuration (baseUrl and token)
 * @returns Configured PlexAPI client
 * @throws Error if configuration is invalid
 */
export function createPlexClient(plexConfig: PlexConfig): PlexAPI {
  if (!plexConfig?.baseUrl || !plexConfig?.token) {
    throw new Error(
      "Invalid Plex configuration: baseUrl and token are required",
    );
  }

  try {
    const url = new URL(plexConfig.baseUrl);

    const hostname = url.hostname;
    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === "https:"
        ? 443
        : 32400;
    const https = url.protocol === "https:";

    return new PlexAPI({
      hostname,
      port,
      https,
      token: plexConfig.token,
      timeout: 30000,
      options: {
        identifier: "bernard-plex-client",
        product: "Bernard",
        version: "1.0.0",
        device: "Server",
        deviceName: "Bernard AI Assistant",
        platform: "Node.js",
        platformVersion: process.version,
      },
    });
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("Invalid URL")) {
      throw new Error(`Invalid Plex baseUrl: ${plexConfig.baseUrl}`);
    }
    throw error;
  }
}

/** Validate Plex configuration */
export function isValidPlexConfig(
  plexConfig: Partial<PlexConfig>,
): plexConfig is PlexConfig {
  if (!plexConfig) return false;
  try {
    if (!plexConfig.baseUrl || typeof plexConfig.baseUrl !== "string")
      return false;
    new URL(plexConfig.baseUrl);
    if (!plexConfig.token || typeof plexConfig.token !== "string") return false;
    return true;
  } catch {
    return false;
  }
}

/** Parse Plex server URL into components */
export function parsePlexUrl(baseUrl: string): {
  hostname: string;
  port: number;
  https: boolean;
} {
  const url = new URL(baseUrl);
  return {
    hostname: url.hostname,
    port: url.port
      ? parseInt(url.port, 10)
      : url.protocol === "https:"
        ? 443
        : 32400,
    https: url.protocol === "https:",
  };
}
