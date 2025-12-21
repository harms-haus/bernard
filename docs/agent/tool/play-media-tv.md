# play_media_tv Tool

The `play_media_tv` tool enables voice assistant agents to search for media content in Plex libraries and initiate playback on supported TV locations through conditional execution based on device capabilities.

## Overview

This tool provides a unified interface for media discovery and playback control across multiple TV locations. It searches Plex media libraries and executes appropriate actions based on each device's available control mechanisms.

### Surface API

```typescript
play_media_tv(location_id: string, media_query: string): Promise<string>
```

**Parameters:**
- `location_id`: TV location identifier (enum: "livingroom" | "bedroom")
- `media_query`: Media title to search for in Plex libraries

**Returns:** Status message describing the actions performed

## Architecture

### Component Flow

```
Voice Assistant Agent
        ↓
    [Tool: play_media_tv]
        ↓
    ├─ Plex HTTP API (search, get metadata)
    └─ Home Assistant WebSocket API (ADB commands)
        ↓
    Android TV Device (Plex app launched)
```

### Execution Model

The tool performs conditional execution based on device capabilities:

1. **Plex Library Search**: Always searches Movies and TV Shows sections
2. **Result Ranking**: Scores and selects best match using multiple criteria
3. **Device-Specific Actions**:
   - **ADB Commands**: Launches Plex app via Home Assistant when HA entity configured
   - **Direct Navigation**: Future support for direct content navigation when Plex client ID available

## Supported Locations

The tool supports two TV locations with specific capabilities:

| Location | HA Entity ID | Plex Client ID | Actions Available |
|----------|-------------|----------------|-------------------|
| `livingroom` | `media_player.living_room_tv_lucifer` | `8d526b29a260ac38-com-plexapp-android` | ADB launch + Direct navigation |
| `bedroom` | `media_player.main_bed_tv_asmodeus` | `dc1b3ceb227d64ba-com-plexapp-android` | ADB launch + Direct navigation |

## Configuration

### Prerequisites

The tool requires both Plex Media Server and Home Assistant configurations:

#### Plex Configuration
- **Server URL**: Base URL of Plex Media Server (default port 32400)
- **Access Token**: Long-lived Plex API token from account settings

#### Home Assistant Configuration
- **Base URL**: Home Assistant instance URL
- **Access Token**: Long-lived access token for API access

### Device Capabilities

Each location supports different control mechanisms:

#### ADB Control (Home Assistant)
When `haEntityId` is configured:
- Sends ADB commands to launch Plex app
- Uses Android Debug Bridge protocol via Home Assistant
- Command: `am start -n com.plexapp.android/com.plexapp.activities.MainActivity`

#### Direct Plex Navigation
When `plexClientId` is configured:
- Enables direct content navigation via Plex API
- Bypasses Home Assistant when device is already online
- Uses Plex client machine identifier for targeted control

## Search and Selection

### Search Scope
- **Libraries**: Searches both "Movies" and "TV Shows" sections
- **Limit**: Returns up to 10 results per library section
- **Query**: Case-insensitive partial title matching

### Ranking Algorithm
Results are ranked by multiple criteria (highest score first):

1. **Exact Match** (+100): Title matches query exactly
2. **Starts With** (+80): Title begins with query
3. **Contains** (+50): Title contains query anywhere
4. **View Count** (+1-20): Higher for more watched content
5. **Recently Added** (+15): Content added within 30 days

### Selection
Returns the highest-ranked result for playback initiation.

## Usage Examples

### Basic Usage

```typescript
// Search for Inception in living room
play_media_tv("livingroom", "Inception")
// Result: "Found 'Inception' (movie) and launched Plex app on Living Room TV."
```

### Bedroom TV Playback

```typescript
// Search for The Matrix in bedroom
play_media_tv("bedroom", "The Matrix")
// Result: "Found 'The Matrix' (movie) and launched Plex app on Bedroom TV."
```

## Error Handling

The tool provides structured error responses:

### Invalid Location
```
Error: Location "kitchen" is not supported. Supported locations: livingroom, bedroom
```

### No Media Found
```
No media found matching "nonexistent movie" in Plex libraries
```

### Configuration Missing
```
Error: Plex configuration is required to search media libraries
```

### Device Unavailable
```
Error: Location "livingroom" but no actions are available for location "livingroom". Please check device configuration.
```

## Technical Details

### Dependencies
- **Plex API**: HTTP REST API for media search and metadata
- **Home Assistant**: WebSocket API for ADB command execution
- **Device Mapping**: Hard-coded configuration mapping locations to capabilities

### Execution Conditions

| HA Entity | Plex Client | Actions Performed |
|-----------|-------------|-------------------|
| ✅ Available | ✅ Available | ADB launch + Future direct navigation |
| ✅ Available | ❌ Missing | ADB launch only |
| ❌ Missing | ✅ Available | Future direct navigation only |
| ❌ Missing | ❌ Missing | Error: no actions available |

### Security Considerations
- Plex API tokens are long-lived and should be protected
- Home Assistant access tokens require appropriate permissions
- Device mappings contain sensitive infrastructure identifiers

## Future Enhancements

### Planned Capabilities
- Direct Plex API navigation using client identifiers
- Multi-device casting support
- Watch history integration
- Playlist creation via Plex API
- Content recommendation based on viewing patterns

### Configuration Flexibility
- Dynamic device discovery and mapping
- User-configurable location definitions
- Support for additional media sources beyond Plex
