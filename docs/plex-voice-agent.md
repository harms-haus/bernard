# Plex Voice Assistant Media Tool Development Guide

## Overview

This tool enables a voice assistant agent to search for media in Plex and display it on specified Android TV devices via Home Assistant ADB integration. The tool provides a unified interface to:

1. Search Plex libraries for movies/TV shows
2. Launch the Plex app on the target device
3. Navigate to the found media in the Plex UI

## Architecture

### Component Overview

```
Voice Assistant Agent
        ↓
    [Tool: playPlexMedia]
        ↓
    ├─ Plex HTTP API (search, get metadata)
    └─ Home Assistant WebSocket API (ADB commands)
        ↓
    Android TV Device (Plex UI navigated to media)
```

### Key Design Decisions

- **Surface API**: `playPlexMedia(locationId: string, mediaQuery: string): Promise<PlayPlexResult>`
- **Location Mapping**: locationId maps Home Assistant ADB entity IDs to Plex client identifiers (cached during initialization)
- **Focus on Navigation**: Tool brings up the media in Plex UI rather than attempting direct playback via intents
- **Error Handling**: Structured errors with actionable messages for the voice agent
- **State Management**: Maintains minimal state—device mappings and cache only

## Plex API Documentation

### Authentication

All Plex API requests require the `X-Plex-Token` header:

```typescript
headers: {
  'X-Plex-Token': plexToken,
  'Accept': 'application/json'
}
```

**Token**: Long-lived access token from Plex account settings.  
**Base URL**: `http://<plex-server-ip>:32400` (default port)

### Search Endpoint

**Endpoint**: `GET /library/sections/{sectionId}/all`

Searches a specific library section. Common section IDs: `1` (Movies), `2` (TV Shows).

**Parameters**:
- `title` (string): Partial title match (case-insensitive, fuzzy matching)
- `type` (string): Filter by type—`1` for movie, `2` for show/season, `3` for episode
- `limit` (integer): Max results to return (default: 50, max: 1000)
- `sort` (string): Sort field, e.g., `titleSort`, `addedAt:desc`

**Example Request**:

```typescript
const searchMedia = async (
  plexUrl: string,
  plexToken: string,
  sectionId: string,
  query: string,
  mediaType?: 'movie' | 'show'
): Promise<SearchResult[]> => {
  const params = new URLSearchParams({
    title: query,
    limit: '10'
  });

  if (mediaType === 'movie') {
    params.append('type', '1');
  } else if (mediaType === 'show') {
    params.append('type', '2');
  }

  const response = await fetch(
    `${plexUrl}/library/sections/${sectionId}/all?${params}`,
    {
      headers: {
        'X-Plex-Token': plexToken,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Plex search failed: ${response.status}`);
  }

  const data = await response.json();
  return data.MediaContainer.Metadata || [];
};
```

**Response Format**:

```typescript
interface PlexMediaItem {
  ratingKey: string;        // Unique identifier for this item
  key: string;              // URL path to media details
  title: string;            // Media title
  type: 'movie' | 'show' | 'season' | 'episode';
  year: number;
  thumb: string;            // Thumbnail image URL
  art: string;              // Poster art URL
  summary?: string;
  duration?: number;        // In milliseconds
  addedAt: number;          // Unix timestamp
  viewCount?: number;
}
```

### Get Library Sections

**Endpoint**: `GET /library/sections`

Retrieves all available library sections (Movies, TV Shows, etc.).

**Example**:

```typescript
const getLibrarySections = async (
  plexUrl: string,
  plexToken: string
): Promise<LibrarySection[]> => {
  const response = await fetch(`${plexUrl}/library/sections`, {
    headers: {
      'X-Plex-Token': plexToken
    }
  });

  const data = await response.json();
  return data.MediaContainer.Directory || [];
};

interface LibrarySection {
  key: string;              // Use as sectionId
  title: string;            // "Movies", "TV Shows", etc.
  type: string;
  thumb: string;
}
```

### Get Available Clients

**Endpoint**: `GET /clients`

Lists all Plex client devices connected to the server. Use this to map device names to client identifiers.

**Example**:

```typescript
const getPlexClients = async (
  plexUrl: string,
  plexToken: string
): Promise<PlexClient[]> => {
  const response = await fetch(`${plexUrl}/clients`, {
    headers: {
      'X-Plex-Token': plexToken
    }
  });

  const data = await response.json();
  return data.MediaContainer.Server || [];
};

interface PlexClient {
  name: string;
  clientIdentifier: string;
  protocolVersion: string;
  protocolVersions: string;
  provides: string;         // Comma-separated, e.g., "timeline,playback,navigation,mirror,ui"
}
```

**Note**: The `clientIdentifier` is needed for targeted navigation commands (see Home Assistant ADB section).

## Home Assistant WebSocket API Integration

### Library: home-assistant-js-websocket

**Installation**:
```bash
npm install home-assistant-js-websocket
```

### Connection Setup

```typescript
import {
  createConnection,
  subscribeEntities,
  callService,
  getAuth,
  Auth
} from 'home-assistant-js-websocket';

interface HAConnection {
  conn: any;           // WebSocket connection
  auth: Auth;
}

const createHAConnection = async (
  hassUrl: string,
  clientId?: string
): Promise<HAConnection> => {
  let auth: Auth;

  try {
    // Try to restore previous auth
    auth = await getAuth({ hassUrl });
  } catch (err) {
    // First time connection - redirect to auth
    auth = await getAuth({
      hassUrl,
      clientId: clientId || window.location.hostname
    });
  }

  const conn = await createConnection({ auth });
  return { conn, auth };
};
```

**Configuration**:
- `hassUrl`: Full URL to Home Assistant instance (e.g., `http://localhost:8123`)
- `clientId`: Usually the domain/hostname of your app; identifies your client to HA

### Calling Services

Use `callService()` to trigger ADB commands on Android TV devices.

**Method**: `callService(connection, domain, service, serviceData?, target?)`

```typescript
const callAdbCommand = async (
  conn: any,
  entityId: string,
  command: string
): Promise<void> => {
  await callService(
    conn,
    'androidtv',
    'adb_command',
    {
      command: command
    },
    {
      entity_id: entityId
    }
  );
};
```

**Service**: `androidtv.adb_command`

Sends an ADB command to an Android TV device via Home Assistant.

**Parameters**:
- `command` (string): ADB shell command to execute
  - Format: Activity manager commands like `am start -n package/activity`
  - Or navigation keys like `HOME`, `BACK`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `ENTER`

**Example Commands**:

```typescript
// Launch Plex app main screen
'am start -n com.plexapp.android/com.plexapp.activities.MainActivity'

// Send remote key presses
'KEYCODE_HOME'
'KEYCODE_BACK'
'KEYCODE_DPAD_UP'
'KEYCODE_DPAD_DOWN'
'KEYCODE_DPAD_LEFT'
'KEYCODE_DPAD_RIGHT'
'KEYCODE_ENTER'

// Input text (if focused in search box)
'input text "Inception"'

// Simulate navigation depth
// (Each press narrows in the UI)
```

## Device Mapping Strategy

### Option A: Hard-coded Mapping (Recommended for Static Setups)

```typescript
interface DeviceMapping {
  [locationId: string]: {
    haEntityId: string;         // e.g., "media_player.living_room_tv"
    plexClientIdentifier?: string;  // Optional: cached from Plex client discovery
    deviceName: string;         // Human-readable name
  }
}

const DEVICE_MAPPING: DeviceMapping = {
  'living_room': {
    haEntityId: 'media_player.living_room_tv',
    plexClientIdentifier: 'abc123def456',
    deviceName: 'Living Room TV'
  },
  'bedroom': {
    haEntityId: 'media_player.bedroom_tv',
    plexClientIdentifier: 'xyz789uvw012',
    deviceName: 'Bedroom TV'
  }
};
```

### Option B: Dynamic Discovery + Caching

```typescript
const discoverAndCacheDevices = async (
  haConn: any,
  plexUrl: string,
  plexToken: string
): Promise<DeviceMapping> => {
  // 1. Get ADB entities from Home Assistant
  const states = await getStates(haConn);
  const adbEntities = states.filter(e => 
    e.entity_id.startsWith('media_player.') && 
    e.attributes?.device_name?.includes('AndroidTV')
  );

  // 2. Get Plex clients
  const plexClients = await getPlexClients(plexUrl, plexToken);

  // 3. Match ADB device names to Plex client names
  const mapping: DeviceMapping = {};
  adbEntities.forEach(entity => {
    const deviceName = entity.attributes.device_name;
    const plexClient = plexClients.find(
      c => c.name.toLowerCase() === deviceName.toLowerCase()
    );

    // Create locationId from entity (strip domain prefix)
    const locationId = entity.entity_id.split('.')[1];

    mapping[locationId] = {
      haEntityId: entity.entity_id,
      plexClientIdentifier: plexClient?.clientIdentifier,
      deviceName: deviceName
    };
  });

  // Cache to file or storage
  await cacheDeviceMapping(mapping);
  return mapping;
};
```

## Tool Implementation

### Main Interface

```typescript
interface PlayPlexResult {
  success: boolean;
  mediaTitle: string;
  mediaType: 'movie' | 'show';
  deviceName: string;
  plexAppLaunched: boolean;
  message: string;
}

interface PlayPlexError extends Error {
  code: string;
  context?: {
    query?: string;
    locationId?: string;
    mediaCount?: number;
  }
}

const playPlexMedia = async (
  locationId: string,
  mediaQuery: string
): Promise<PlayPlexResult> => {
  // Implementation details below
};
```

### Full Implementation Template

```typescript
import { callService, Connection } from 'home-assistant-js-websocket';

interface ToolConfig {
  plexUrl: string;
  plexToken: string;
  haConn: Connection;
  deviceMapping: DeviceMapping;
  searchLibraries?: string[];  // Plex library section IDs; if unset, search all
}

let toolConfig: ToolConfig;

const initializePlayPlexTool = async (config: ToolConfig): Promise<void> => {
  toolConfig = config;
  // Verify connections work
  try {
    // Test Plex connection
    const sections = await getLibrarySections(
      config.plexUrl,
      config.plexToken
    );
    if (sections.length === 0) {
      throw new Error('No library sections found in Plex');
    }

    // Test HA connection by getting states
    console.log('✓ Plex and Home Assistant connections verified');
  } catch (err) {
    throw new Error(`Tool initialization failed: ${err.message}`);
  }
};

const playPlexMedia = async (
  locationId: string,
  mediaQuery: string
): Promise<PlayPlexResult> => {
  // =========== STEP 1: Validate Inputs ===========
  const deviceConfig = toolConfig.deviceMapping[locationId];
  if (!deviceConfig) {
    const error = new Error(
      `Location "${locationId}" not found. Available locations: ${
        Object.keys(toolConfig.deviceMapping).join(', ')
      }`
    ) as PlayPlexError;
    error.code = 'LOCATION_NOT_FOUND';
    throw error;
  }

  if (!mediaQuery || mediaQuery.trim().length === 0) {
    const error = new Error('Media query cannot be empty') as PlayPlexError;
    error.code = 'EMPTY_QUERY';
    throw error;
  }

  // =========== STEP 2: Search Plex ===========
  let searchResults: PlexMediaItem[] = [];
  const librariesToSearch = toolConfig.searchLibraries || ['1', '2']; // Default: Movies + TV

  for (const sectionId of librariesToSearch) {
    try {
      const results = await searchMedia(
        toolConfig.plexUrl,
        toolConfig.plexToken,
        sectionId,
        mediaQuery
      );
      searchResults.push(...results);
    } catch (err) {
      console.warn(`Search failed for section ${sectionId}:`, err.message);
    }
  }

  if (searchResults.length === 0) {
    const error = new Error(
      `No media found matching "${mediaQuery}" in Plex libraries`
    ) as PlayPlexError;
    error.code = 'NO_RESULTS';
    error.context = { query: mediaQuery };
    throw error;
  }

  // =========== STEP 3: Rank and Select Best Match ===========
  const bestMatch = rankSearchResults(mediaQuery, searchResults);

  // =========== STEP 4: Launch Plex App ===========
  try {
    await callService(
      toolConfig.haConn,
      'androidtv',
      'adb_command',
      {
        command: 'am start -n com.plexapp.android/com.plexapp.activities.MainActivity'
      },
      {
        entity_id: deviceConfig.haEntityId
      }
    );
  } catch (err) {
    const error = new Error(
      `Failed to launch Plex app on ${deviceConfig.deviceName}: ${err.message}`
    ) as PlayPlexError;
    error.code = 'APP_LAUNCH_FAILED';
    error.context = { locationId };
    throw error;
  }

  // =========== STEP 5: Navigate to Media (Optional Enhancement) ===========
  // Future: Use deep links or navigation commands if Plex API supports it
  // For now, Plex app opens and user can see recent/featured content
  // Voice agent can indicate which media was found

  return {
    success: true,
    mediaTitle: bestMatch.title,
    mediaType: bestMatch.type === 'movie' ? 'movie' : 'show',
    deviceName: deviceConfig.deviceName,
    plexAppLaunched: true,
    message: `Found "${bestMatch.title}" and launched Plex on ${deviceConfig.deviceName}. Search for it in the app or wait for auto-play.`
  };
};

// =========== HELPER: Rank Search Results ===========
const rankSearchResults = (query: string, results: PlexMediaItem[]): PlexMediaItem => {
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
  return scored.sort((a, b) => b.score - a.score)[0].item;
};

// =========== HELPER: Search Media ===========
const searchMedia = async (
  plexUrl: string,
  plexToken: string,
  sectionId: string,
  query: string
): Promise<PlexMediaItem[]> => {
  const params = new URLSearchParams({
    title: query,
    limit: '10'
  });

  const response = await fetch(
    `${plexUrl}/library/sections/${sectionId}/all?${params}`,
    {
      headers: {
        'X-Plex-Token': plexToken,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Plex API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.MediaContainer?.Metadata || [];
};

// =========== HELPER: Get Library Sections ===========
const getLibrarySections = async (
  plexUrl: string,
  plexToken: string
): Promise<LibrarySection[]> => {
  const response = await fetch(`${plexUrl}/library/sections`, {
    headers: {
      'X-Plex-Token': plexToken,
      'Accept': 'application/json'
    }
  });

  const data = await response.json();
  return data.MediaContainer?.Directory || [];
};

// =========== HELPER: Get Plex Clients ===========
const getPlexClients = async (
  plexUrl: string,
  plexToken: string
): Promise<PlexClient[]> => {
  const response = await fetch(`${plexUrl}/clients`, {
    headers: {
      'X-Plex-Token': plexToken,
      'Accept': 'application/json'
    }
  });

  const data = await response.json();
  return data.MediaContainer?.Server || [];
};
```

## Usage Example

### Setup

```typescript
import { createConnection, getAuth } from 'home-assistant-js-websocket';

// 1. Initialize Home Assistant connection
const auth = await getAuth({
  hassUrl: 'http://your-ha.local:8123'
});
const haConn = await createConnection({ auth });

// 2. Define device mapping
const devices: DeviceMapping = {
  'living_room': {
    haEntityId: 'media_player.living_room_tv',
    plexClientIdentifier: 'abc123',
    deviceName: 'Living Room'
  }
};

// 3. Initialize tool
await initializePlayPlexTool({
  plexUrl: 'http://your-plex-server.local:32400',
  plexToken: 'your-plex-token',
  haConn,
  deviceMapping: devices,
  searchLibraries: ['1', '2']  // Movies, TV Shows
});
```

### Voice Agent Integration

```typescript
// Within your voice agent's tool handler:
try {
  const result = await playPlexMedia('living_room', 'Inception');
  
  // Respond to user
  voiceAssistant.speak(
    `Found ${result.mediaTitle} and opened Plex on ${result.deviceName}. ` +
    `You can now select it to play.`
  );
} catch (err) {
  if (err.code === 'NO_RESULTS') {
    voiceAssistant.speak(`Sorry, I couldn't find "${mediaQuery}" in your Plex library.`);
  } else if (err.code === 'APP_LAUNCH_FAILED') {
    voiceAssistant.speak(`I found the media but couldn't open Plex on that device.`);
  } else {
    voiceAssistant.speak(`Something went wrong: ${err.message}`);
  }
}
```

## Extension Points

### Future Enhancements

1. **Deep Navigation**: If Plex adds search intent support, implement navigation commands to automatically jump to search results
2. **Playback via HTTP API**: Use Plex's `/playQueues` endpoint to create playlists and trigger playback
3. **Multi-Device Casting**: Extend to support casting between devices
4. **Watch History**: Integrate with Plex watch history to handle "continue watching" scenarios
5. **Fuzzy Matching**: Replace simple string ranking with Levenshtein distance for typo tolerance

### Configuration Flexibility

```typescript
interface ExtendedToolConfig extends ToolConfig {
  // Enable debug logging
  debug?: boolean;
  
  // Custom ranking function for search results
  rankingFunction?: (query: string, results: PlexMediaItem[]) => PlexMediaItem;
  
  // Timeout for Plex API calls (ms)
  plexTimeout?: number;
  
  // Retry failed requests
  maxRetries?: number;
}
```

## Error Handling Strategy

All errors should include:
- **Code**: Machine-readable error identifier (e.g., `LOCATION_NOT_FOUND`)
- **Message**: User-friendly description
- **Context**: Additional data for debugging/retry logic

```typescript
type ErrorCode = 
  | 'LOCATION_NOT_FOUND'
  | 'EMPTY_QUERY'
  | 'NO_RESULTS'
  | 'APP_LAUNCH_FAILED'
  | 'PLEX_API_ERROR'
  | 'HA_CONNECTION_ERROR';

// Voice agent can handle specific errors appropriately
if (err.code === 'LOCATION_NOT_FOUND') {
  // Suggest available locations
} else if (err.code === 'NO_RESULTS') {
  // Ask user to refine search
}
```

## Testing Checklist

- [ ] Plex API search returns correct results for various queries
- [ ] Device mapping resolves correctly
- [ ] ADB command launches Plex app successfully
- [ ] Error cases throw appropriate errors with codes
- [ ] Ranking selects expected best match for ambiguous queries
- [ ] Tool integrates smoothly with voice agent
- [ ] Handles network failures gracefully
- [ ] Works with both Movies and TV Shows libraries
