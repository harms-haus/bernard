import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HomeAssistantServiceCall } from "./utility/home-assistant-entities";
import { getHAConnection } from "./utility/home-assistant-websocket-client";
import type { HARestConfig } from "./home-assistant-list-entities.tool";
import { getEntityState } from "./home-assistant-get-entity-state.tool";
import { callHAService } from "./utility/home-assistant-rest-client";
import {
  resolveDeviceConfig,
  resolveHAEntityId,
  resolveHAPlexEntityId,
  resolveAdbAddress,
  getDeviceName,
  getSupportedLocations
} from "./utility/plex-device-mapping";
import { getRedis } from "../../../../lib/infra";
import { logger } from "../../../../lib/logging";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

/**
 * Plex configuration
 */
export type PlexConfig = {
  baseUrl: string;
  token: string;
};

/**
 * Plex Media Item interface
 */
interface PlexMediaItem {
  ratingKey: string;
  key: string;
  title: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  year: number;
  thumb: string;
  art: string;
  summary?: string;
  duration?: number;
  addedAt: number;
  viewCount?: number;
  viewOffset?: number; // in milliseconds
}

/**
 * Plex Library Section interface
 */
interface LibrarySection {
  key: string;
  title: string;
  type: string;
  thumb: string;
}

/**
 * Dependencies for the play plex media tool
 */
export type PlayPlexMediaDependencies = {
  searchPlexMediaImpl: typeof searchPlexMedia;
  getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
  getPlexItemMetadataImpl: typeof getPlexItemMetadata;
  callHAServiceWebSocketImpl: typeof callHAServiceWebSocket;
  rankSearchResultsImpl: typeof rankSearchResults;
  recordServiceCallImpl: (serviceCall: HomeAssistantServiceCall) => void | Promise<void>;
};

const defaultDeps: PlayPlexMediaDependencies = {
  searchPlexMediaImpl: searchPlexMedia,
  getPlexLibrarySectionsImpl: getPlexLibrarySections,
  getPlexItemMetadataImpl: getPlexItemMetadata,
  callHAServiceWebSocketImpl: callHAServiceWebSocket,
  rankSearchResultsImpl: rankSearchResults,
  recordServiceCallImpl: () => {
    throw new Error("recordServiceCallImpl must be provided via dependencies");
  },
};

/**
 * Call a Home Assistant service via WebSocket API (internal function)
 */
async function callHAServiceWebSocket(
  baseUrl: string,
  accessToken: string,
  domain: string,
  service: string,
  serviceData: Record<string, unknown>
): Promise<void> {
  try {
    const connection = await getHAConnection(baseUrl, accessToken);
    await connection.sendMessagePromise({
      type: "call_service",
      domain,
      service,
      service_data: serviceData
    });
  } catch (error) {
    console.error('[HA WebSocket] Failed to call service:', error);
    throw error;
  }
}

/**
 * Plex client information
 */
interface PlexClientInfo {
  machineIdentifier: string;
  name: string;
  host?: string;
  port?: number;
  protocol?: string;
}

/**
 * Get Plex server identity information
 */
async function getPlexServerIdentity(plexConfig: PlexConfig): Promise<{ machineIdentifier: string }> {
  const response = await fetch(`${plexConfig.baseUrl}/identity`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get Plex server identity: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { machineIdentifier?: string } };
  const machineIdentifier = data.MediaContainer?.machineIdentifier;
  if (!machineIdentifier) {
    throw new Error('Server machine identifier not found in identity response');
  }
  return { machineIdentifier };
}

/**
 * Discover Plex clients and find one by machine identifier
 */
async function discoverPlexClient(
  plexConfig: PlexConfig,
  targetMachineIdentifier: string
): Promise<PlexClientInfo | null> {
  const response = await fetch(`${plexConfig.baseUrl}/clients`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to discover Plex clients: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { Server?: PlexClientInfo[] } };
  const clients: PlexClientInfo[] = data.MediaContainer?.Server || [];

  // Find the client by machine identifier
  const targetClient = clients.find(client =>
    client.machineIdentifier === targetMachineIdentifier
  );

  if (!targetClient) {
    console.warn(`Plex client with machineIdentifier '${targetMachineIdentifier}' not found in discovered clients`);
    return null;
  }

  return targetClient;
}

/**
 * Search Plex libraries for media
 */
async function searchPlexMedia(
  plexConfig: PlexConfig,
  sectionId: string,
  query: string
): Promise<PlexMediaItem[]> {
  const params = new URLSearchParams({
    title: query,
    limit: '10'
  });

  const response = await fetch(
    `${plexConfig.baseUrl}/library/sections/${sectionId}/all?${params}`,
    {
      headers: {
        'X-Plex-Token': plexConfig.token,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Plex API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { Metadata?: PlexMediaItem[] } };
  return data.MediaContainer?.Metadata || [];
}

/**
 * Get detailed metadata for a specific Plex item by ratingKey
 */
async function getPlexItemMetadata(
  plexConfig: PlexConfig,
  ratingKey: string
): Promise<PlexMediaItem | null> {
  const response = await fetch(`${plexConfig.baseUrl}/library/metadata/${ratingKey}`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Plex API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { Metadata?: PlexMediaItem[] } };
  return data.MediaContainer?.Metadata?.[0] || null;
}

/**
 * Get Plex library sections
 */
async function getPlexLibrarySections(plexConfig: PlexConfig): Promise<LibrarySection[]> {
  const response = await fetch(`${plexConfig.baseUrl}/library/sections`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Plex API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { Directory?: LibrarySection[] } };
  return data.MediaContainer?.Directory || [];
}

/**
 * Rank search results and return the best match
 */
function rankSearchResults(query: string, results: PlexMediaItem[]): PlexMediaItem {
  const queryLower = query.toLowerCase();

  // Score each result
  const scored = results.map(item => {
    let score = 0;

    // Exact match
    if (item.title.toLowerCase() === queryLower) score += 100;
    // Starts with query
    else if (item.title.toLowerCase().startsWith(queryLower)) score += 80;
    // Contains query
    else if (item.title.toLowerCase().includes(queryLower)) score += 50;

    // Prefer media with more metadata (higher view count = more relevant)
    if (item.viewCount) score += Math.min(item.viewCount, 20);

    // Prefer recently added
    const ageInDays = (Date.now() / 1000 - item.addedAt) / 86400;
    if (ageInDays < 30) score += 15;

    return { item, score };
  });

  // Return highest scored result
  const sorted = scored.sort((a, b) => b.score - a.score);
  if (sorted.length === 0) {
    throw new Error('No search results to rank');
  }
  return sorted[0]!.item;
}

/**
 * Check if the media player is powered on
 */
async function checkMediaPlayerPowerState(
  haConfig: HARestConfig | undefined,
  entityId: string | null,
  adbAddress: string | null
): Promise<boolean> {
  // Try direct ADB first if available
  if (adbAddress) {
    try {
      const adbResult = await checkScreenPowerViaAdb(adbAddress);
      return adbResult;
    } catch (error) {
      logger.warn({
        msg: 'Direct ADB power check failed, falling back to HA',
        address: adbAddress,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Fall back to HA entity state check
  if (haConfig?.accessToken && entityId) {
    try {
      const entityState = await getEntityState(
        haConfig.baseUrl,
        haConfig.accessToken,
        entityId
      );

      // Media players use various states: 'on', 'idle', 'playing', 'paused', etc.
      // Only 'off' means the TV is off. Everything else (including 'idle', 'unavailable') means it's on
      const state = entityState?.state?.toLowerCase();
      const haSaysOn = state !== 'off' && state !== 'unavailable' && state !== 'unknown';

      return haSaysOn;

    } catch (error) {
      logger.warn({
        msg: 'HA power check failed',
        entityId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // If both methods fail, assume device is on to avoid breaking functionality
  logger.warn({
    msg: 'All power state checks failed, assuming TV is on',
    adbAddress,
    entityId
  });
  return true;
}

/**
 * Check if Plex appears to be the current app
 * Note: Only returns true if Plex is explicitly detected
 */
async function checkIfPlexIsCurrentApp(
  haConfig: HARestConfig | undefined,
  entityId: string | null,
  adbAddress: string | null
): Promise<boolean> {
  // Try direct ADB first if available
  if (adbAddress) {
    try {
      const adbResult = await checkPlexActivityViaAdb(adbAddress);
      return adbResult;
    } catch (error) {
      logger.warn({
        msg: 'Direct ADB Plex check failed, falling back to HA',
        address: adbAddress,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Fall back to HA entity attributes check
  if (haConfig?.accessToken && entityId) {
    try {
      const entityState = await getEntityState(
        haConfig.baseUrl,
        haConfig.accessToken,
        entityId
      );

      // Check various indicators that might suggest Plex is running
      const appName = entityState?.attributes?.['app_name'];
      const source = entityState?.attributes?.['source'];
      const appId = entityState?.attributes?.['app_id'];

      // Check app_name (most reliable indicator)
      const appNameStr = typeof appName === 'string' ? appName : '';
      if (appNameStr.toLowerCase().includes('plex')) {
        return true;
      }

      // Check source (running apps as sources) - this is very reliable
      const sourceStr = typeof source === 'string' ? source : '';
      if (sourceStr.toLowerCase().includes('plex')) {
        return true;
      }

      // Check app_id
      const appIdStr = typeof appId === 'string' ? appId : '';
      if (appIdStr.includes('plex') || appIdStr.includes('com.plexapp.android')) {
        return true;
      }

    } catch (error) {
      logger.warn({
        msg: 'HA Plex check failed',
        entityId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // If both methods fail or don't detect Plex, assume it's not active
  return false;
  return false;
}

/**
 * Turn on the media player device
 */
async function turnOnMediaPlayer(
  haConfig: HARestConfig,
  entityId: string,
  deps: PlayPlexMediaDependencies
): Promise<void> {
  if (!haConfig.accessToken) {
    throw new Error('Home Assistant access token is required to turn on media player');
  }

  await deps.callHAServiceWebSocketImpl(
    haConfig.baseUrl,
    haConfig.accessToken,
    'media_player',
    'turn_on',
    { entity_id: entityId }
  );
}


/**
 * Launch Plex app on Android TV device via Home Assistant media_player.select_source
 * Uses the Plex app ID: com.plexapp.android
 */
async function launchPlexApp(
  haConfig: HARestConfig,
  entityId: string,
  deps: PlayPlexMediaDependencies
): Promise<void> {
  if (!haConfig.accessToken) {
    throw new Error('Home Assistant access token is required');
  }

  // Use Home Assistant's media_player.select_source to launch Plex
  const plexAppId = 'com.plexapp.android';

  try {
    await deps.callHAServiceWebSocketImpl(
      haConfig.baseUrl,
      haConfig.accessToken,
      'media_player',
      'select_source',
      {
        entity_id: entityId,
        source: plexAppId
      }
    );

  } catch (error) {
    throw error;
  }
}

/**
 * ADB configuration stored in Redis
 */
interface AdbConfig {
  privateKey: string;
  publicKey: string;
}

/**
 * Get ADB keys from Redis, generating them if they don't exist
 */
async function getAdbKeys(): Promise<AdbConfig> {
  const redis = getRedis();

  try {
    const existingKeys = await redis.get('adb_keys');
    if (existingKeys) {
      return JSON.parse(existingKeys);
    }
  } catch (error) {
    console.warn('Failed to retrieve ADB keys from Redis:', error);
  }

  // Generate new ADB keys
  logger.info('Generating new ADB keys for device authorization');

  const keyDir = path.join(os.tmpdir(), 'bernard-adb-keys');
  const privateKeyPath = path.join(keyDir, 'adbkey');
  const publicKeyPath = path.join(keyDir, 'adbkey.pub');

  try {
    // Create key directory
    await fs.promises.mkdir(keyDir, { recursive: true });

    // Generate RSA key pair using ssh-keygen
    await execAsync(`ssh-keygen -t rsa -b 2048 -f "${privateKeyPath}" -N "" -C "bernard-livingroom-tv"`);

    // Read the keys
    const privateKey = await fs.promises.readFile(privateKeyPath, 'utf8');
    const publicKey = await fs.promises.readFile(publicKeyPath, 'utf8');

    const adbConfig: AdbConfig = {
      privateKey,
      publicKey
    };

    // Store in Redis
    await redis.set('adb_keys', JSON.stringify(adbConfig));

    // Clean up temporary files
    await fs.promises.unlink(privateKeyPath);
    await fs.promises.unlink(publicKeyPath);
    await fs.promises.rmdir(keyDir);

    logger.info('ADB keys generated and stored securely');
    return adbConfig;

  } catch (error) {
    logger.error({
      msg: 'Failed to generate ADB keys',
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error('Could not generate ADB authentication keys');
  }
}

/**
 * Initialize ADB connection to living room TV only
 * This should be called during system startup
 */
async function initializeLivingRoomAdb(): Promise<void> {
  console.log('🔧 Initializing ADB connection to living room TV...');

  // Check if ADB is available
  if (!(await isAdbAvailable())) {
    console.log('ADB not installed - skipping ADB initialization, will use HA fallback');
    return;
  }

  try {
    // Generate keys if needed
    await getAdbKeys();

    // Connect to living room TV only
    const livingRoomAddress = '10.97.1.90:5555';
    console.log(`Connecting to living room TV at ${livingRoomAddress}...`);

    // Kill any existing server and start fresh
    try {
      await execAsync('adb kill-server', { timeout: 5000 });
      await new Promise(resolve => setTimeout(resolve, 1000));
      await execAsync('adb start-server', { timeout: 5000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (serverError) {
      console.warn('ADB server restart failed:', serverError);
    }

    // Attempt connection
    const connectResult = await execAsync(`adb connect ${livingRoomAddress}`, { timeout: 10000 });
    console.log(`ADB connect result: ${connectResult.stdout.trim()}`);

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify connection
    const devicesResult = await execAsync('adb devices', { timeout: 5000 });
    console.log(`ADB devices: ${devicesResult.stdout.trim()}`);

    if (devicesResult.stdout.includes(livingRoomAddress) && !devicesResult.stdout.includes('offline')) {
      console.log('✅ Living room TV ADB connection established successfully');

      // Test communication
      try {
        const testResult = await executeDirectAdbCommand(livingRoomAddress, 'echo "ADB ready"');
        if (testResult.includes('ADB ready')) {
          console.log('✅ Living room TV ADB communication verified');
        } else {
          console.log('⚠️  Living room TV connected but test communication failed');
        }
      } catch (testError) {
        console.log('⚠️  Living room TV connected but test communication failed:', testError);
      }
    } else {
      console.log('⚠️  Living room TV ADB connection failed - will use HA fallback');
    }

  } catch (error) {
    console.error('Failed to initialize living room ADB connection:', error);
    console.log('Will use HA fallback for living room TV control');
  }

  console.log('🏠 Bedroom TV ADB connection deliberately skipped (wife sleeping)');
}

/**
 * Check if ADB is available on the system
 */
async function isAdbAvailable(): Promise<boolean> {
  try {
    await execAsync('which adb', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute ADB command directly on a device
 */
async function executeDirectAdbCommand(
  adbAddress: string,
  command: string
): Promise<string> {
  // Check if ADB is available
  if (!(await isAdbAvailable())) {
    throw new Error('ADB is not installed on this system. Please install Android SDK platform tools.');
  }

  const adbKeys = await getAdbKeys();

  // Create temporary key files
  const keyDir = path.join(os.tmpdir(), `bernard-adb-${Date.now()}`);
  const privateKeyPath = path.join(keyDir, 'adbkey');

  try {
    await fs.promises.mkdir(keyDir, { recursive: true });
    await fs.promises.writeFile(privateKeyPath, adbKeys.privateKey, { mode: 0o600 });

    // ADB command with key authentication
    const adbCommand = `ADB_VENDOR_KEYS="${privateKeyPath}" adb -s ${adbAddress} shell "${command}"`;

    const { stdout, stderr } = await execAsync(adbCommand, {
      timeout: 10000, // 10 second timeout
      env: {
        ...process.env,
        ADB_VENDOR_KEYS: privateKeyPath
      }
    });

    if (stderr && !stdout) {
      console.warn('ADB command produced stderr:', stderr);
    }

    return stdout.trim();

  } catch (error: any) {
    logger.error({
      msg: 'ADB command execution failed',
      address: adbAddress,
      command,
      error: error.message
    });

    // Try to connect first if connection failed
    if (error.message.includes('device offline') || error.message.includes('no devices') || error.message.includes('device not found')) {
      try {
        console.log(`Attempting to connect to ${adbAddress}...`);

        // First kill any existing ADB server
        try {
          await execAsync('adb kill-server', { timeout: 2000 });
        } catch (e) {
          // Ignore kill-server errors
        }

        // Start ADB server
        await execAsync('adb start-server', { timeout: 5000 });

        // Try to connect
        const connectResult = await execAsync(`adb connect ${adbAddress}`, { timeout: 10000 });

        // Wait for connection to establish
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if device is now connected
        const devicesResult = await execAsync('adb devices', { timeout: 5000 });

        if (!devicesResult.stdout.includes(adbAddress) || devicesResult.stdout.includes('offline')) {
          logger.error({
            msg: 'ADB connection recovery failed',
            address: adbAddress,
            devices: devicesResult.stdout.trim()
          });
          throw new Error(`Failed to connect to ${adbAddress} - device not found in adb devices list`);
        }

        logger.info({
          msg: 'ADB connection recovered successfully',
          address: adbAddress
        });

        // Retry the command
        const adbCommand = `ADB_VENDOR_KEYS="${privateKeyPath}" adb -s ${adbAddress} shell "${command}"`;
        const { stdout } = await execAsync(adbCommand, {
          timeout: 10000,
          env: {
            ...process.env,
            ADB_VENDOR_KEYS: privateKeyPath
          }
        });
        return stdout.trim();

      } catch (retryError: any) {
        logger.error({
          msg: 'ADB command retry failed',
          address: adbAddress,
          error: retryError.message,
          command
        });

        // Provide helpful troubleshooting information
        const troubleshooting = `
ADB Connection Troubleshooting:
1. Enable ADB over network on your Android TV:
   - Go to Settings > Device Preferences > About
   - Tap "Android TV OS Build" 7 times to enable Developer Options
   - Go to Settings > Device Preferences > Developer options
   - Enable "ADB debugging" and "ADB over network"

2. Find your TV's IP address in Developer Options > ADB over network

3. If still failing, try USB connection first:
   - Connect TV via USB to this machine
   - Run: adb devices (should show device)
   - Run: adb tcpip 5555
   - Disconnect USB, then try network connection

4. Check firewall settings and network connectivity

Current error: ${retryError.message}
        `.trim();

        logger.error({
          msg: 'ADB connection troubleshooting',
          address: adbAddress,
          troubleshooting,
          originalError: retryError.message
        });
        throw new Error(`ADB connection failed for ${adbAddress}. Check logs for troubleshooting steps.`);
      }
    }

    throw error;

  } finally {
    // Clean up temporary key file
    try {
      await fs.promises.unlink(privateKeyPath);
      await fs.promises.rmdir(keyDir);
    } catch (cleanupError) {
      logger.warn({
        msg: 'ADB key cleanup failed',
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      });
    }
  }
}

/**
 * Call an ADB command directly and return the result
 */
async function callAdbCommand(
  adbAddress: string,
  command: string
): Promise<{ adb_response?: string }> {
  try {
    const output = await executeDirectAdbCommand(adbAddress, command);
    return { adb_response: output };
  } catch (error) {
    logger.warn({
      msg: 'ADB command failed, returning empty result',
      address: adbAddress,
      command,
      error: error instanceof Error ? error.message : String(error)
    });
    return {}; // Return empty result on failure
  }
}

/**
 * Check screen power state using ADB command
 */
async function checkScreenPowerViaAdb(
  adbAddress: string
): Promise<boolean> {
  try {
    const result = await callAdbCommand(
      adbAddress,
      'dumpsys power | grep mWakefulness='
    );

    const output = result.adb_response || '';

    if (output.includes('mWakefulness=Awake') || output.includes('mWakefulness=Asleep')) {
      return true;
    } else if (output.includes('mWakefulness=Dozing')) {
      return false;
    }

    logger.warn({
      msg: 'Unable to parse ADB power state output',
      output
    });
    // If we can't determine the state, assume it's on (safer default)
    return true;
  } catch (error) {
    logger.error({
      msg: 'ADB power state check failed',
      address: adbAddress,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Check if Plex is the current activity using ADB command
 */
async function checkPlexActivityViaAdb(
  adbAddress: string
): Promise<boolean> {
  try {
    // First try a simple test command to see if ADB is working
    const testResult = await callAdbCommand(
      adbAddress,
      'echo "ADB_TEST"'
    );

    if (!testResult.adb_response || !testResult.adb_response.includes('ADB_TEST')) {
      logger.warn({
        msg: 'ADB connectivity test failed',
        address: adbAddress
      });
      return false;
    }

    // Try the primary command first (may not work on all Android TV versions)
    let result = await callAdbCommand(
      adbAddress,
      'dumpsys window windows | grep mCurrentFocus='
    );

    let output = result.adb_response || '';
    let focusMatch = null;

    // Parse: mCurrentFocus=Window{... u0 com.plexapp.android/com.plexapp.activities.MainActivity}
    if (output.trim()) {
      focusMatch = output.match(
        /mCurrentFocus=Window\{[^}]*\s+u0\s+([^/]+)\/([^\}]+)\}/
      );
    }

    if (!focusMatch) {
      console.log('Primary activity command failed or returned empty, trying alternative...');

      // Try alternative command for Android 10+
      result = await callAdbCommand(
        adbAddress,
        'dumpsys activity activities | grep ResumedActivity'
      );

      output = result.adb_response || '';

      // Parse: mResumedActivity: ActivityRecord{cdc9e4c u0 com.plexapp.android/com.plexapp.plex.home.tv.HomeActivityTV t585}
      // Look for the package name after "u0 " in the ActivityRecord
      focusMatch = output.match(
        /ActivityRecord\{[^}]*\s+u0\s+([^/\s}]+)\/[^\s}]*/
      );

      if (!focusMatch) {
        logger.warn({
          msg: 'ADB activity detection failed to parse package name',
          address: adbAddress,
          output
        });
        return false;
      }
    }

    const packageName = focusMatch[1];
    const isPlex = packageName === 'com.plexapp.android';

    logger.debug({
      msg: 'ADB activity detection result',
      address: adbAddress,
      packageName,
      isPlex
    });

    return isPlex;
  } catch (error) {
    logger.error({
      msg: 'ADB Plex activity check failed',
      address: adbAddress,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Create the play plex media tool
 */
export function createPlayPlexMediaTool(
  haRestConfig?: HARestConfig,
  plexConfig?: PlexConfig,
  overrides: Partial<PlayPlexMediaDependencies> = {}
) {
  const deps: PlayPlexMediaDependencies = {
    ...defaultDeps,
    ...overrides,
    recordServiceCallImpl: haRestConfig ? (serviceCall: HomeAssistantServiceCall) => {
      // For now, we'll record the service call but not actually execute it
      // The WebSocket implementation handles the actual execution
      console.warn('Recording service call:', serviceCall);
    } : () => {
      throw new Error("Home Assistant context manager not available for recording service calls");
    }
  };

  const supportedLocations = getSupportedLocations();

  return tool(
    async ({
      location_id,
      media_query,
      playback_mode = "resume"
    }: {
      location_id: string;
      media_query: string;
      playback_mode?: "resume" | "restart";
    }) => {
      // Validate inputs
      if (!location_id || typeof location_id !== 'string') {
        return "Error: location_id parameter is required and must be a string";
      }

      if (!media_query || media_query.trim().length === 0) {
        return "Error: media_query parameter is required and cannot be empty";
      }

      if (!plexConfig) {
        return "Error: Plex configuration is required to search media libraries";
      }

      // Resolve device configuration
      const deviceConfig = resolveDeviceConfig(location_id);
      if (!deviceConfig) {
        return `Error: Location "${location_id}" is not supported. Supported locations: ${supportedLocations.join(', ')}`;
      }

      const deviceName = getDeviceName(location_id);
      const haEntityId = resolveHAEntityId(location_id);
      const haPlexEntityId = resolveHAPlexEntityId(location_id);
      const adbAddress = resolveAdbAddress(location_id);

      try {
        const actions: string[] = [];

        const {bestMatch, mediaType} = await searchPlexBestMatch(plexConfig, media_query, deps);

        await ensureTvOn(haEntityId, haRestConfig, adbAddress, actions, deviceName, deps);

        await ensurePlexActive(haEntityId, haRestConfig, adbAddress, actions, deviceName, deps);

        await playMediaOnPlex(haPlexEntityId, haRestConfig, deps, plexConfig, mediaType, bestMatch, deviceName, actions, location_id, playback_mode);

        if (actions.length === 0) {
          return `Found "${bestMatch.title}" (${mediaType}) but no actions are available for location "${location_id}". Please check device configuration.`;
        }

        return `Found "${bestMatch.title}" (${mediaType})\n${actions.join('\n')}`;

      } catch (error) {
        const errorMessage = error instanceof Error
          ? `${error.message}\n${error.stack}`
          : typeof error === 'object'
          ? JSON.stringify(error, null, 2)
          : String(error);
        return `Error playing Plex media: ${errorMessage}`;
      }
    },
    {
      name: "play_media_tv",
      description: `Search for media in Plex libraries and control playback on supported TV locations. Supported locations: ${supportedLocations.join(', ')}. The tool automatically powers on the TV if needed, launches Plex via Home Assistant media_player.select_source, and uses Home Assistant's Plex integration to play media directly. It searches both Movies and TV Shows libraries and selects the best match. Actions performed depend on device capabilities: powers on device, launches apps via Home Assistant, and uses Home Assistant Plex entities for media playback.`,
      schema: z.object({
        location_id: z.enum(supportedLocations as [string, ...string[]]).describe(`TV location identifier. Supported: ${supportedLocations.join(', ')}`),
        media_query: z.string().describe("Media title to search for in Plex (e.g., 'Inception', 'The Matrix')"),
        playback_mode: z.enum(["resume", "restart"]).optional().default("resume").describe("Playback mode: 'resume' to continue from last position, 'restart' to start from beginning")
      })
    }
  );
}

async function searchPlexBestMatch(plexConfig: PlexConfig, media_query: string, deps: PlayPlexMediaDependencies): Promise<{ bestMatch: PlexMediaItem, mediaType: 'movie' | 'show' }> {
  const searchResults: PlexMediaItem[] = [];

  // Get available library sections dynamically
  const librarySections = await deps.getPlexLibrarySectionsImpl(plexConfig);

  // Filter sections to common media libraries (Movies and TV Shows)
  // These are the most common library types for media playback
  const targetSectionTitles = ['Movies', 'TV Shows'];
  const sectionsToSearch = librarySections.filter(section =>
    targetSectionTitles.some(title =>
      section.title.toLowerCase().includes(title.toLowerCase())
    )
  );

  if (sectionsToSearch.length === 0) {
    console.warn(`No matching library sections found. Available sections: ${librarySections.map(s => s.title).join(', ')}`);
    throw new Error(`No suitable media libraries found in Plex (looking for: ${targetSectionTitles.join(', ')})`);
  }

  console.log(`Searching ${sectionsToSearch.length} library sections: ${sectionsToSearch.map(s => s.title).join(', ')}`);

  // Search each matching section
  for (const section of sectionsToSearch) {
    try {
      console.log(`Searching library "${section.title}" (ID: ${section.key}) for "${media_query}"`);
      const results = await deps.searchPlexMediaImpl(plexConfig, section.key, media_query);
      console.log(`Found ${results.length} results in "${section.title}"`);
      searchResults.push(...results);
    } catch (err) {
      console.warn(`Search failed for library "${section.title}" (ID: ${section.key}):`, err);
      // Continue with other sections even if one fails
    }
  }

  if (searchResults.length === 0) {
    const searchedLibraries = sectionsToSearch.map(s => s.title).join(', ');
    throw new Error(`No media found matching "${media_query}" in Plex libraries (${searchedLibraries})`);
  }

  const bestMatch = deps.rankSearchResultsImpl(media_query, searchResults);
  return {
    bestMatch,
    mediaType: bestMatch.type === 'movie' ? 'movie' : 'show',
  };
}

async function ensureTvOn(haEntityId: string | null, haRestConfig: HARestConfig | undefined, adbAddress: string | null, actions: string[], deviceName: string, deps: PlayPlexMediaDependencies) {
  // Loop up to 10 times: check if TV is on, if not, turn it on and wait
  for (let attempt = 1; attempt <= 10; attempt++) {
    const isPoweredOn = await checkMediaPlayerPowerState(haRestConfig, haEntityId, adbAddress);

    if (isPoweredOn) {
      if (attempt === 1) {
        actions.push(`TV ${deviceName} is already on`);
      } else {
        actions.push(`Turned on TV ${deviceName}`);
      }
      break; // TV is on, we're done
    }

    let turnOnSucceeded = false;

    try {
      // Try direct ADB first if available
      if (adbAddress) {
        try {
          await executeDirectAdbCommand(adbAddress, 'input keyevent 224'); // Wake key
          turnOnSucceeded = true;
        } catch (adbError) {
          logger.warn({
            msg: 'Direct ADB turn-on failed, trying HA fallback',
            device: deviceName,
            address: adbAddress,
            error: adbError instanceof Error ? adbError.message : String(adbError)
          });
          // Fall back to HA if ADB fails
          if (haEntityId && haRestConfig) {
            await turnOnMediaPlayer(haRestConfig, haEntityId, deps);
            turnOnSucceeded = true;
          }
        }
      } else if (haEntityId && haRestConfig) {
        // Use HA if no ADB address
        await turnOnMediaPlayer(haRestConfig, haEntityId, deps);
        turnOnSucceeded = true;
      } else {
        throw new Error('No method available to turn on TV');
      }
    } catch (error) {
      logger.error({
        msg: 'TV turn-on attempt failed',
        device: deviceName,
        attempt,
        maxAttempts: 10,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt === 10) {
        throw new Error(`Failed to turn on TV ${deviceName} after 10 attempts: ${error}`);
      }
    }

    if (!turnOnSucceeded && attempt === 10) {
      throw new Error(`Failed to turn on TV ${deviceName} - all methods exhausted`);
    }

    // Wait 1000ms before next attempt
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function ensurePlexActive(haEntityId: string | null, haRestConfig: HARestConfig | undefined, adbAddress: string | null, actions: string[], deviceName: string, deps: PlayPlexMediaDependencies) {
  // Loop up to 10 times: check if Plex is active, if not, launch it and wait
  for (let attempt = 1; attempt <= 10; attempt++) {
    const isPlexCurrent = await checkIfPlexIsCurrentApp(haRestConfig, haEntityId, adbAddress);

    if (isPlexCurrent) {
      if (attempt === 1) {
        actions.push(`Plex is already current app on ${deviceName}`);
      } else {
        actions.push(`Set Plex as the current app on ${deviceName}`);
      }
      break; // Plex is active, we're done
    }

    let launchSucceeded = false;

    try {
      // Try direct ADB first if available
      if (adbAddress) {
        try {
          // First try to bring existing Plex instance to foreground
          await executeDirectAdbCommand(adbAddress, 'am start -f 0x200000 -n com.plexapp.android/.MainActivity');

          // Wait a bit and check if it's now foreground
          await new Promise(resolve => setTimeout(resolve, 1000));
          const checkForeground = await checkPlexActivityViaAdb(adbAddress);

          if (!checkForeground) {
            // If not foreground, try launching the NowPlaying activity
            await executeDirectAdbCommand(adbAddress, 'am start -n com.plexapp.android/com.plexapp.plex.home.tv.NowPlayingActivityTV');

            // Wait and check again
            await new Promise(resolve => setTimeout(resolve, 1000));
            const finalCheck = await checkPlexActivityViaAdb(adbAddress);
            if (!finalCheck) {
              // Last resort: try to switch to Plex task
              await executeDirectAdbCommand(adbAddress, 'am task switch com.plexapp.android');
            }
          }

          launchSucceeded = true;
        } catch (adbError) {
          logger.warn({
            msg: 'Direct ADB Plex launch failed, trying HA fallback',
            device: deviceName,
            address: adbAddress,
            attempt,
            error: adbError instanceof Error ? adbError.message : String(adbError)
          });
          // Fall back to HA if ADB fails
          if (haEntityId && haRestConfig) {
            await launchPlexApp(haRestConfig, haEntityId, deps);
            launchSucceeded = true;
          }
        }
      } else if (haEntityId && haRestConfig) {
        // Use HA if no ADB address
        await launchPlexApp(haRestConfig, haEntityId, deps);
        launchSucceeded = true;
      } else {
        throw new Error('No method available to launch Plex');
      }
    } catch (error) {
      logger.error({
        msg: 'Plex launch attempt failed',
        device: deviceName,
        attempt,
        maxAttempts: 10,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt === 10) {
        throw new Error(`Failed to launch Plex on ${deviceName} after 10 attempts: ${error}`);
      }
    }

    if (!launchSucceeded && attempt === 10) {
      throw new Error(`Failed to launch Plex on ${deviceName} - all methods exhausted`);
    }

    // Wait 1000ms before next attempt
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function playMediaOnPlex(haPlexEntityId: string | null, haRestConfig: HARestConfig | undefined, deps: PlayPlexMediaDependencies, plexConfig: PlexConfig, mediaType: 'movie' | 'show', bestMatch: PlexMediaItem, deviceName: string, actions: string[], location_id: string, playback_mode: "resume" | "restart" = "resume") {
  if (haPlexEntityId && haRestConfig && haRestConfig.accessToken) {
    // Build media_content_id object dynamically
    const mediaContentId: any = {
      library_name: mediaType === 'movie' ? 'Movies' : 'TV Shows'
    };

    // Add title/show_name based on media type
    if (mediaType === 'movie') {
      mediaContentId.title = bestMatch.title;
    } else {
      mediaContentId.show_name = bestMatch.title;
    }

    // Handle resume mode: get viewOffset from Plex API and convert to seconds
    if (playback_mode === 'resume') {
      try {
        const itemMetadata = await deps.getPlexItemMetadataImpl(plexConfig, bestMatch.ratingKey);

        if (itemMetadata?.viewOffset && itemMetadata.viewOffset > 0) {
          // Convert milliseconds to seconds for Home Assistant
          mediaContentId.offset = Math.floor(itemMetadata.viewOffset / 1000);
        }
      } catch (error) {
        console.warn(`Failed to get viewOffset for ${bestMatch.title}:`, error);
        // Continue without offset - will play from beginning
      }

      if (mediaType === 'show') {
        // For shows, add inProgress to find latest in-progress episode
        mediaContentId.inProgress = true;
      }
    }

    // Build service data with appropriate content type
    const serviceData: any = {
      media_content_type: mediaType === 'movie' ? 'MOVIE' : 'EPISODE',
      media_content_id: `plex://${JSON.stringify(mediaContentId)}`
    };

    // Use Home Assistant's Plex integration to play media directly
    for (let i = 0; i < 3; i++) {
      try {
        await deps.callHAServiceWebSocketImpl(
          haRestConfig.baseUrl,
          haRestConfig.accessToken,
          'media_player',
          'play_media',
          {
            entity_id: haPlexEntityId,
            ...serviceData
          }
        );
      } catch (error) {
        console.warn(`Failed to play media on ${deviceName}:`, error);
        if (i === 2) {
          throw error;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const playbackDescription = playback_mode === 'resume'
      ? ' (resuming if available)'
      : ' (starting from beginning)';

    actions.push(`Started "${bestMatch.title}" playback on ${deviceName} via Home Assistant Plex${playbackDescription}`);
  } else {
    actions.push(`No Home Assistant Plex entity configured for ${location_id}`);
  }
}

/**
 * The play plex media tool instance factory
 */
export function createPlayPlexMediaToolInstance(
  haRestConfig?: HARestConfig,
  plexConfig?: PlexConfig
) {
  return createPlayPlexMediaTool(haRestConfig, plexConfig);
}


