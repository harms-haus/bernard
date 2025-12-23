# Resume Playback via Home Assistant - Implementation Guide

## Overview

Use Home Assistant's Plex media player integration to resume playback with `resume` and `offset` parameters. This approach leverages Home Assistant's native Plex service without direct API calls.

**Advantages**:
- No need to fetch metadata separately
- Uses Home Assistant's existing Plex integration
- Built-in handling of resume logic
- Simpler than direct Plex API calls

## Home Assistant Media Player Service

### Service: media_player.play_media

Home Assistant's Plex integration supports playing media with resume/offset parameters.

**Required Parameters**:
- `entity_id`: Plex media player entity (e.g., `media_player.plex_android_tv`)
- `media_content_type`: `EPISODE` for shows, `MOVIE` for movies
- `media_content_id`: JSON string with search criteria

**Special Parameters** (in media_content_id):
- `library_name`: (string) Name of library to search ("Movies", "TV Shows", etc.)
- `show_name` or `title`: (string) Media title to search for
- `inProgress`: (boolean) Find only in-progress episodes for shows
- `unwatched`: (boolean) Find only unwatched episodes
- `offset`: (integer) Start position in **seconds**
- `resume`: (boolean) Resume from last watched position

**Note**: `offset` is in **seconds** (not milliseconds like Plex API).

## Implementation Strategy

### For Movies

1. Call `media_player.play_media` with:
   - `title` to search for the movie
   - `resume: true` to automatically resume from last position
   - OR provide specific `offset` in seconds

### For TV Shows

1. Call `media_player.play_media` with:
   - `show_name` to search for the show
   - `inProgress: true` to find the latest in-progress episode
   - Home Assistant automatically finds the next unfinished episode
   - If no in-progress episode, finds first unwatched
   - If all watched, plays latest episode from beginning

## Updated playPlexMedia Function

```typescript
import { callService, Connection } from 'home-assistant-js-websocket';

interface PlayOptions {
  autoPlay?: boolean;
  useResumeFeature?: boolean;  // NEW: default true
  forceNewFromBeginning?: boolean;  // Force play from start
  specificOffset?: number;  // Override resume with specific offset (seconds)
}

const playPlexMedia = async (
  locationId: string,
  mediaQuery: string,
  options?: PlayOptions
): Promise<PlayPlexResult> => {
  const autoPlay = options?.autoPlay ?? toolConfig.autoPlayDefault;
  const useResumeFeature = options?.useResumeFeature ?? true;

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

  // =========== STEP 4: Play via Home Assistant ===========
  if (autoPlay) {
    try {
      await playMediaViaHomeAssistant(
        toolConfig.haConn,
        deviceConfig,
        bestMatch,
        {
          useResume: useResumeFeature && !options?.forceNewFromBeginning,
          offsetSeconds: options?.specificOffset
        }
      );
    } catch (err) {
      const error = new Error(
        `Failed to play media on ${deviceConfig.deviceName}: ${err.message}`
      ) as PlayPlexError;
      error.code = 'PLAYBACK_FAILED';
      throw error;
    }
  } else {
    // Just launch the app without playing
    try {
      await callService(
        toolConfig.haConn,
        'androidtv',
        'adb_command',
        {
          command: 'am start -n com.plexapp.android/.MainActivity'
        },
        {
          entity_id: deviceConfig.haEntityId
        }
      );
    } catch (err) {
      const error = new Error(
        `Failed to launch Plex on ${deviceConfig.deviceName}`
      ) as PlayPlexError;
      error.code = 'FOREGROUND_FAILED';
      throw error;
    }
  }

  await new Promise(resolve => 
    setTimeout(resolve, toolConfig.appLaunchDelayMs)
  );

  return {
    success: true,
    mediaTitle: bestMatch.title,
    mediaType: bestMatch.type === 'movie' ? 'movie' : 'show',
    deviceName: deviceConfig.deviceName,
    plexAppLaunched: true,
    autoPlayStarted: autoPlay,
    message: autoPlay
      ? useResumeFeature && !options?.forceNewFromBeginning
        ? `Playing "${bestMatch.title}" on ${deviceConfig.deviceName} (resuming if available)`
        : `Now playing "${bestMatch.title}" on ${deviceConfig.deviceName}`
      : `Found "${bestMatch.title}". Opened Plex on ${deviceConfig.deviceName}.`
  };
};
```

## Helper Function: playMediaViaHomeAssistant

```typescript
interface PlayMediaOptions {
  useResume?: boolean;      // Use resume feature
  offsetSeconds?: number;   // Specific start offset in seconds
}

interface DeviceConfig {
  haEntityId: string;
  plexMediaPlayerEntity: string;  // NEW: entity_id of Plex media player
  deviceName: string;
}

const playMediaViaHomeAssistant = async (
  haConn: Connection,
  deviceConfig: DeviceConfig,
  media: PlexMediaItem,
  options?: PlayMediaOptions
): Promise<void> => {
  // Determine library name (Movies, TV Shows, etc.)
  const libraryName = media.type === 'movie' ? 'Movies' : 'TV Shows';
  const mediaContentType = media.type === 'movie' ? 'MOVIE' : 'EPISODE';

  // Build media_content_id JSON
  const mediaContentId = {
    library_name: libraryName,
    ...(media.type === 'movie' 
      ? { title: media.title }
      : { 
          show_name: media.title,
          // For shows, find in-progress episodes for resume
          ...(options?.useResume && { inProgress: true })
        }
    )
  };

  // Build service call data
  const serviceData: any = {
    media_content_type: mediaContentType,
    media_content_id: JSON.stringify(mediaContentId)
  };

  // Add resume or offset parameter
  if (options?.offsetSeconds && options.offsetSeconds > 0) {
    // Specific offset provided
    mediaContentId.offset = options.offsetSeconds;
  } else if (options?.useResume) {
    // Use Home Assistant's resume feature
    serviceData.resume = true;
  }

  console.log('Playing via HA:', {
    entity: deviceConfig.plexMediaPlayerEntity,
    media: mediaContentId,
    resume: options?.useResume,
    offset: options?.offsetSeconds
  });

  await callService(
    haConn,
    'media_player',
    'play_media',
    serviceData,
    {
      entity_id: deviceConfig.plexMediaPlayerEntity
    }
  );
};
```

## Device Configuration Update

Update `DeviceMapping` to include Plex media player entity:

```typescript
interface DeviceMapping {
  [locationId: string]: {
    haEntityId: string;                    // ADB entity (e.g., media_player.living_room_tv)
    plexMediaPlayerEntity: string;         // NEW: Plex media player (e.g., media_player.plex_android_tv)
    plexClientIdentifier?: string;         // Optional: cached from Plex
    deviceName: string;
  }
}

const DEVICE_MAPPING: DeviceMapping = {
  'living_room': {
    haEntityId: 'media_player.living_room_tv',
    plexMediaPlayerEntity: 'media_player.plex_living_room_tv',
    plexClientIdentifier: 'abc123def456',
    deviceName: 'Living Room TV'
  },
  'bedroom': {
    haEntityId: 'media_player.bedroom_tv',
    plexMediaPlayerEntity: 'media_player.plex_bedroom_tv',
    plexClientIdentifier: 'xyz789uvw012',
    deviceName: 'Bedroom TV'
  }
};
```

## Finding Your Plex Media Player Entity

1. In Home Assistant, go to **Settings → Devices & Services → Plex Media Server**
2. Look for your Plex client device
3. The media player entity will be named like:
   - `media_player.plex_<device_name>`
   - Example: `media_player.plex_living_room_android_tv`

Can be found via Developer Tools → States, filtering for `media_player.plex_`

## Usage Examples

### Auto-Resume Movie

```typescript
const result = await playPlexMedia('living_room', 'Inception');
// Home Assistant finds Inception, resumes from last watched position
// Result: "Playing "Inception" on Living Room TV (resuming if available)"
```

### Resume Latest Episode of Show

```typescript
const result = await playPlexMedia('bedroom', 'Breaking Bad');
// Home Assistant finds Breaking Bad
// Uses inProgress: true to find the latest in-progress episode
// Automatically resumes from that episode's last position
// Result: "Playing "Breaking Bad" on Bedroom TV (resuming if available)"
```

### Force Play from Beginning

```typescript
const result = await playPlexMedia('living_room', 'Inception', {
  forceNewFromBeginning: true
});
// Plays Inception from start, ignoring any previous progress
```

### Play from Specific Time (in seconds)

```typescript
const result = await playPlexMedia('bedroom', 'Inception', {
  useResumeFeature: false,
  specificOffset: 3600  // Start at 1 hour in (3600 seconds)
});
// Plays Inception starting at 1 hour mark
```

## How Home Assistant Handles Resume

**For Movies**:
- If `resume: true`, Home Assistant checks Plex server for this movie's viewOffset
- If viewOffset > 0, starts playback from that position
- Otherwise starts from beginning

**For TV Shows** (with `inProgress: true`):
- Home Assistant queries Plex for all episodes of the show
- Finds the latest episode with `viewOffset > 0 && < duration` (in-progress)
- If found, starts playing that episode from its viewOffset
- If no in-progress episode, plays first unwatched from beginning
- If all watched, plays latest episode from beginning

**Note**: Home Assistant's Plex integration handles all the logic—you just pass the search criteria.

## Error Handling

```typescript
try {
  await playPlexMedia('living_room', 'Breaking Bad');
} catch (err) {
  if (err.code === 'NO_RESULTS') {
    voiceAssistant.speak(`I couldn't find that show or movie.`);
  } else if (err.code === 'PLAYBACK_FAILED') {
    voiceAssistant.speak(
      `I found the media but couldn't start playback. ` +
      `Make sure the device is online.`
    );
  }
}
```

## Configuration

Add to `ToolConfig`:

```typescript
interface ToolConfig {
  // ... existing config
  plexMediaPlayerDefault?: boolean;  // Use HA Plex service (default: true)
  resumePlaybackDefault?: boolean;   // Enable resume feature (default: true)
}
```

## Testing Checklist

- [ ] Plex media player entity is found and accessible
- [ ] Movie plays and resumes from last position
- [ ] Movie can be forced to play from beginning
- [ ] Show finds latest in-progress episode
- [ ] Show plays from first unwatched if no in-progress
- [ ] Show plays latest if all episodes watched
- [ ] Specific offset in seconds works correctly
- [ ] Resume parameter handled gracefully if no progress exists
- [ ] Voice agent receives proper status messages
- [ ] Works with different library names
- [ ] Error handling for unavailable device
- [ ] Multiple devices work independently

## Advantages Over Direct Plex API

1. **No metadata gathering**: Home Assistant handles finding media and progress
2. **Simpler code**: No need to query `/library/metadata` endpoints
3. **Better integration**: Uses existing HA Plex service
4. **Native support**: Resume/offset built into HA Plex service
5. **Less latency**: Leverages HA's cached connections
