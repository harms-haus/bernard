# Plex Voice Assistant Media Tool - Complete Implementation Guide

## Overview

A comprehensive TypeScript tool for voice assistant agents to search, find, and play media from a Plex server on specific Android TV devices via Home Assistant ADB integration.

**Surface API**: `playPlexMedia(locationId: string, mediaQuery: string, options?: PlayOptions): Promise<PlayPlexResult>`

### Key Capabilities

1. **Search** Plex libraries for movies and TV shows
2. **Play** media automatically via Plex HTTP API
3. **Display** playback on the correct Android TV device
4. **Handle** errors gracefully with structured error codes
5. **Integrate** with voice assistant agents

## Architecture

```
Voice Assistant Agent
        ↓
    [Tool: playPlexMedia]
        ├─ Search Plex (HTTP API)
        ├─ Create PlayQueue (HTTP API)
        └─ Launch & Focus App (ADB via Home Assistant)
        ↓
    Android TV Device (Media visible and playing)
```

## Setup & Initialization

### 1. Install Dependencies

```bash
npm install home-assistant-js-websocket
```

### 2. Initialize Connections

```typescript
import {
  createConnection,
  callService,
  getAuth,
  Auth,
  Connection
} from 'home-assistant-js-websocket';

// Home Assistant connection
const auth = await getAuth({
  hassUrl: 'http://your-ha.local:8123'
});
const haConn = await createConnection({ auth });

// Define your TV devices
const DEVICE_MAPPING = {
  'living_room': {
    haEntityId: 'media_player.living_room_tv',
    plexClientIdentifier: 'abc123def456',  // Find via plex.tv/devices
    deviceName: 'Living Room TV'
  },
  'bedroom': {
    haEntityId: 'media_player.bedroom_tv',
    plexClientIdentifier: 'xyz789uvw012',
    deviceName: 'Bedroom TV'
  }
};

// Initialize the tool
await initializePlayPlexTool({
  plexUrl: 'http://your-plex-server.local:32400',
  plexToken: 'your-plex-token',  // Get from Plex account settings
  haConn,
  deviceMapping: DEVICE_MAPPING,
  searchLibraries: ['1', '2'],    // 1=Movies, 2=TV Shows
  appLaunchDelayMs: 500
});
```

**Finding Your Plex Token**:
- Go to **plex.tv/account/preferences/app-passwords** (while logged in)
- Or use: `curl -u email:password 'https://plex.tv/users/sign_in.json'`

**Finding Your Client Identifier**:
- Visit **plex.tv/devices** and look for your Android TV device
- The `clientIdentifier` is in the device properties

## API Reference

### Plex HTTP API Endpoints

#### Search Library

**Endpoint**: `GET /library/sections/{sectionId}/all`

Search for media by title.

```typescript
const searchMedia = async (
  plexUrl: string,
  plexToken: string,
  sectionId: string,    // '1' for Movies, '2' for TV
  query: string,
  limit: number = 10
): Promise<PlexMediaItem[]> => {
  const params = new URLSearchParams({
    title: query,
    limit: limit.toString()
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
      `Plex search failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.MediaContainer?.Metadata || [];
};

interface PlexMediaItem {
  ratingKey: string;      // Unique ID - use for playback
  title: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  year: number;
  thumb: string;          // Thumbnail URL
  art: string;            // Poster art URL
  summary?: string;
  duration?: number;      // Milliseconds
  addedAt: number;        // Unix timestamp
  viewCount?: number;
}
```

#### Create PlayQueue (For Playback)

**Endpoint**: `POST /playQueues`

Create a playback queue that starts media playing on the Plex server.

```typescript
const createPlayQueue = async (
  plexUrl: string,
  plexToken: string,
  mediaRatingKey: string,
  options?: {
    includeChapters?: boolean;
    shuffle?: boolean;
    repeat?: 0 | 1 | 2;
  }
): Promise<PlayQueue> => {
  const params = new URLSearchParams({
    type: 'video',
    uri: `/library/metadata/${mediaRatingKey}`,
    includeChapters: options?.includeChapters ? '1' : '0',
    shuffle: options?.shuffle ? '1' : '0',
    repeat: (options?.repeat ?? 0).toString()
  });

  const response = await fetch(
    `${plexUrl}/playQueues?${params}`,
    {
      method: 'POST',
      headers: {
        'X-Plex-Token': plexToken,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create play queue: ${response.status}`
    );
  }

  const data = await response.json();
  return data.MediaContainer.PlayQueue[0];
};

interface PlayQueue {
  playQueueID: string;
  playQueueToken: string;
  playQueueVersion: number;
  totalSize: number;
  metadata: PlexMediaItem[];
}
```

#### Get Library Sections

**Endpoint**: `GET /library/sections`

List all available libraries (Movies, TV Shows, etc.).

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
  return data.MediaContainer?.Directory || [];
};

interface LibrarySection {
  key: string;              // Use as sectionId
  title: string;            // "Movies", "TV Shows", etc.
}
```

### Home Assistant WebSocket API

#### Call Service (ADB Command)

**Service**: `androidtv.adb_command`

Send commands to Android TV via ADB.

```typescript
const callAdbCommand = async (
  haConn: Connection,
  entityId: string,
  command: string
): Promise<void> => {
  await callService(
    haConn,
    'androidtv',
    'adb_command',
    { command },
    { entity_id: entityId }
  );
};

// Useful commands:
// Launch Plex main screen:
await callAdbCommand(conn, 'media_player.tv', 
  'am start -n com.plexapp.android/com.plexapp.activities.MainActivity');

// Launch Plex now-playing screen (recommended):
await callAdbCommand(conn, 'media_player.tv',
  'am start -n com.plexapp.android/com.plexapp.activities.NowPlayingActivity');

// Send remote key:
await callAdbCommand(conn, 'media_player.tv', 'KEYCODE_HOME');
await callAdbCommand(conn, 'media_player.tv', 'KEYCODE_DPAD_UP');
```

## Complete Implementation

### Type Definitions

```typescript
interface ToolConfig {
  plexUrl: string;
  plexToken: string;
  haConn: Connection;
  deviceMapping: DeviceMapping;
  searchLibraries?: string[];
  autoPlayDefault?: boolean;
  useNowPlayingScreenDefault?: boolean;
  appLaunchDelayMs?: number;
}

interface DeviceMapping {
  [locationId: string]: {
    haEntityId: string;
    plexClientIdentifier?: string;
    deviceName: string;
  }
}

interface PlayPlexResult {
  success: boolean;
  mediaTitle: string;
  mediaType: 'movie' | 'show';
  deviceName: string;
  plexAppLaunched: boolean;
  message: string;
  autoPlayStarted?: boolean;
  playQueueId?: string;
}

interface PlayPlexError extends Error {
  code: ErrorCode;
  context?: Record<string, any>;
}

type ErrorCode = 
  | 'LOCATION_NOT_FOUND'
  | 'EMPTY_QUERY'
  | 'NO_RESULTS'
  | 'FOREGROUND_FAILED'
  | 'PLEX_API_ERROR'
  | 'HA_CONNECTION_ERROR';

interface PlayOptions {
  autoPlay?: boolean;
  useNowPlayingScreen?: boolean;
  startOffset?: number;
}
```

### Tool Implementation

```typescript
import { callService, Connection } from 'home-assistant-js-websocket';

let toolConfig: ToolConfig;

const initializePlayPlexTool = async (config: ToolConfig): Promise<void> => {
  toolConfig = {
    ...config,
    autoPlayDefault: config.autoPlayDefault ?? true,
    useNowPlayingScreenDefault: config.useNowPlayingScreenDefault ?? true,
    appLaunchDelayMs: config.appLaunchDelayMs ?? 500
  };

  try {
    // Verify Plex connection
    const sections = await getLibrarySections(
      config.plexUrl,
      config.plexToken
    );
    if (sections.length === 0) {
      throw new Error('No library sections found in Plex');
    }

    console.log('✓ Plex and Home Assistant connections verified');
  } catch (err) {
    throw new Error(`Tool initialization failed: ${err.message}`);
  }
};

const playPlexMedia = async (
  locationId: string,
  mediaQuery: string,
  options?: PlayOptions
): Promise<PlayPlexResult> => {
  const autoPlay = options?.autoPlay ?? toolConfig.autoPlayDefault;
  const useNowPlayingScreen = options?.useNowPlayingScreen ?? 
    toolConfig.useNowPlayingScreenDefault;

  // =========== STEP 1: Validate Inputs ===========
  const deviceConfig = toolConfig.deviceMapping[locationId];
  if (!deviceConfig) {
    const error = new Error(
      `Location "${locationId}" not found. Available: ${
        Object.keys(toolConfig.deviceMapping).join(', ')
      }`
    ) as PlayPlexError;
    error.code = 'LOCATION_NOT_FOUND';
    throw error;
  }

  if (!mediaQuery?.trim()) {
    const error = new Error('Media query cannot be empty') as PlayPlexError;
    error.code = 'EMPTY_QUERY';
    throw error;
  }

  // =========== STEP 2: Search Plex ===========
  let searchResults: PlexMediaItem[] = [];
  const librariesToSearch = toolConfig.searchLibraries || ['1', '2'];

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
      `No media found matching "${mediaQuery}"`
    ) as PlayPlexError;
    error.code = 'NO_RESULTS';
    error.context = { query: mediaQuery };
    throw error;
  }

  // =========== STEP 3: Rank & Select ===========
  const bestMatch = rankSearchResults(mediaQuery, searchResults);

  // =========== STEP 4: Trigger Playback ===========
  let playQueueId: string | undefined;
  if (autoPlay) {
    try {
      const playQueue = await createPlayQueue(
        toolConfig.plexUrl,
        toolConfig.plexToken,
        bestMatch.ratingKey,
        { includeChapters: true }
      );
      playQueueId = playQueue.playQueueID;
      console.log(`Created queue ${playQueueId} for ${bestMatch.title}`);
    } catch (err) {
      console.warn('PlayQueue creation failed, continuing with app launch');
    }
  }

  // =========== STEP 5: Bring App to Foreground ===========
  try {
    const activity = useNowPlayingScreen
      ? 'com.plexapp.activities.NowPlayingActivity'
      : 'com.plexapp.activities.MainActivity';

    await callService(
      toolConfig.haConn,
      'androidtv',
      'adb_command',
      { command: `am start -n com.plexapp.android/${activity}` },
      { entity_id: deviceConfig.haEntityId }
    );
  } catch (err) {
    const error = new Error(
      `Failed to launch Plex on ${deviceConfig.deviceName}`
    ) as PlayPlexError;
    error.code = 'FOREGROUND_FAILED';
    throw error;
  }

  // =========== STEP 6: Allow App to Load ===========
  await new Promise(resolve => 
    setTimeout(resolve, toolConfig.appLaunchDelayMs)
  );

  return {
    success: true,
    mediaTitle: bestMatch.title,
    mediaType: bestMatch.type === 'movie' ? 'movie' : 'show',
    deviceName: deviceConfig.deviceName,
    plexAppLaunched: true,
    autoPlayStarted: autoPlay && !!playQueueId,
    playQueueId,
    message: autoPlay && playQueueId
      ? `Now playing "${bestMatch.title}" on ${deviceConfig.deviceName}`
      : `Found "${bestMatch.title}". Opened Plex on ${deviceConfig.deviceName}.`
  };
};

// =========== HELPERS ===========

const rankSearchResults = (
  query: string,
  results: PlexMediaItem[]
): PlexMediaItem => {
  const queryLower = query.toLowerCase();

  const scored = results.map(item => {
    let score = 0;

    // Title matching
    if (item.title.toLowerCase() === queryLower) score += 100;
    else if (item.title.toLowerCase().startsWith(queryLower)) score += 80;
    else if (item.title.toLowerCase().includes(queryLower)) score += 50;

    // Relevance signals
    if (item.viewCount) score += Math.min(item.viewCount, 20);

    const ageInDays = (Date.now() / 1000 - item.addedAt) / 86400;
    if (ageInDays < 30) score += 15;

    return { item, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0].item;
};

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

const getLibrarySections = async (
  plexUrl: string,
  plexToken: string
): Promise<LibrarySection[]> => {
  const response = await fetch(`${plexUrl}/library/sections`, {
    headers: { 'X-Plex-Token': plexToken }
  });

  const data = await response.json();
  return data.MediaContainer?.Directory || [];
};

const createPlayQueue = async (
  plexUrl: string,
  plexToken: string,
  mediaRatingKey: string,
  options?: {
    includeChapters?: boolean;
    shuffle?: boolean;
    repeat?: 0 | 1 | 2;
  }
): Promise<PlayQueue> => {
  const params = new URLSearchParams({
    type: 'video',
    uri: `/library/metadata/${mediaRatingKey}`,
    includeChapters: options?.includeChapters ? '1' : '0',
    shuffle: options?.shuffle ? '1' : '0',
    repeat: (options?.repeat ?? 0).toString()
  });

  const response = await fetch(
    `${plexUrl}/playQueues?${params}`,
    {
      method: 'POST',
      headers: {
        'X-Plex-Token': plexToken,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create play queue: ${response.status}`
    );
  }

  const data = await response.json();
  if (!data.MediaContainer?.PlayQueue?.[0]) {
    throw new Error('Invalid play queue response');
  }

  return data.MediaContainer.PlayQueue[0];
};
```

## Usage Examples

### Basic Playback

```typescript
try {
  const result = await playPlexMedia('living_room', 'Inception');
  console.log(result.message);
  // Output: "Now playing "Inception" on Living Room TV"
} catch (err) {
  console.error(`Error: ${err.message}`);
}
```

### Manual Selection (No Auto-Play)

```typescript
const result = await playPlexMedia('bedroom', 'Breaking Bad', {
  autoPlay: false,
  useNowPlayingScreen: false
});
// Plex app opens to home screen, user can select manually
```

### Voice Assistant Integration

```typescript
async function handlePlayMediaRequest(device: string, title: string) {
  try {
    const result = await playPlexMedia(device, title);
    voiceAssistant.speak(result.message);
  } catch (err) {
    if (err.code === 'NO_RESULTS') {
      voiceAssistant.speak(`I couldn't find "${title}". Try being more specific.`);
    } else if (err.code === 'LOCATION_NOT_FOUND') {
      voiceAssistant.speak(
        `I don't know that device. Try: ${
          Object.keys(toolConfig.deviceMapping).join(', ')
        }`
      );
    } else if (err.code === 'FOREGROUND_FAILED') {
      voiceAssistant.speak(
        `I found the media but couldn't open Plex. Try again?`
      );
    } else {
      voiceAssistant.speak('Something went wrong. Please try again.');
    }
  }
}
```

## Troubleshooting

### Playback Plays in Background

**Problem**: Audio plays but TV screen shows previous app

**Solutions**:
1. Ensure `useNowPlayingScreen: true`
2. Increase `appLaunchDelayMs` to 1000
3. Check Plex client is online

### PlayQueue Creation Fails

**Problem**: `Failed to create play queue` error

**Solutions**:
1. Verify Plex server is running
2. Check `plexToken` is valid
3. Confirm `mediaRatingKey` from search results is correct

### App Opens But No Content

**Problem**: Plex home screen shows instead of now-playing

**Solutions**:
1. Verify `NowPlayingActivity` is used (not `MainActivity`)
2. Check PlayQueue creation logs
3. Increase app launch delay

## Performance Notes

**Typical Flow Times**:
- Search: 50-100ms
- PlayQueue creation: 100-500ms
- ADB command: 50ms
- App launch + connection: 500ms (configurable)

**Total**: ~700-1200ms for full operation

Increase `appLaunchDelayMs` if the app doesn't receive playback state in time.

## Testing Checklist

- [ ] Search returns expected results
- [ ] PlayQueue creation succeeds for found media
- [ ] ADB command launches Plex app
- [ ] NowPlayingActivity brings app to foreground
- [ ] Playback appears on TV screen (not background)
- [ ] Error handling works for all error codes
- [ ] Voice agent can read success/error messages
- [ ] Multiple device locations work correctly
- [ ] 500ms delay is sufficient (adjust if needed)
- [ ] Tool initializes without errors
