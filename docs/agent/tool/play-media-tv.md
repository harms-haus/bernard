# play_media_tv Tool

The `play_media_tv` tool enables voice assistant agents to search for media content in Plex libraries and initiate playback on supported TV locations through conditional execution based on device capabilities.

## Overview

This tool provides a unified interface for media discovery and playback control across multiple TV locations. It searches Plex media libraries and executes appropriate actions based on each device's available control mechanisms.

### Surface API

```typescript
play_media_tv(location_id: string, media_query: string): Promise<string>
```

**Parameters:**

- `location_id`: TV location identifier (enum: "living_room" | "main_bed")
- `media_query`: Media title to search for in Plex libraries

**Returns:** Status message describing the actions performed

## Architecture

### Component Flow

```text
Voice Assistant Agent
        ↓
    [Tool: play_media_tv]
        ↓
    ├─ Plex HTTP API (search, get metadata)
    └─ Home Assistant WebSocket API (device control)
        ↓
    Android TV Device (Plex app launched and media played)
```

### Execution Model

The tool performs conditional execution based on device capabilities:

1. **Plex Library Search**: Dynamically discovers and searches Movies and TV Shows sections
2. **Result Ranking**: Scores and selects best match using multiple criteria
3. **Device-Specific Actions**:
   - **Power Control**: Turns on TV via Home Assistant when HA entity configured
   - **App Launch**: Launches Plex app via Home Assistant media_player.select_source when HA entity configured
   - **Media Playback**: Plays content directly via Home Assistant Plex integration when HA Plex entity configured

## Supported Locations

The tool supports two TV locations with specific capabilities:

| Location | HA Entity ID | HA Plex Entity ID | Actions Available |
|----------|-------------|-------------------|-------------------|
| `living_room` | `media_player.living_room_tv_lucifer` | `media_player.living_room_plex_lucifer` | Power control + App launch + Direct playback |
| `main_bed` | `media_player.main_bed_tv_asmodeus` | `media_player.main_bed_plex_asmodeus` | Power control + App launch + Direct playback |

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

#### Power Control (Home Assistant)

When `haEntityId` is configured:

- Checks TV power state via Home Assistant entity state
- Turns on TV using media_player.turn_on service when needed

#### App Launch (Home Assistant)

When `haEntityId` is configured:

- Launches Plex app using media_player.select_source service
- Uses Plex app ID `com.plexapp.android` as the source parameter
- Checks if Plex is already the current app before launching

#### Media Playback (Home Assistant Plex Integration)

When `haPlexEntityId` is configured:

- Plays media directly using Home Assistant Plex integration
- Uses media_player.play_media service with Plex content identifiers
- Supports both movie and show content types

## Search and Selection

### Search Scope

- **Libraries**: Dynamically discovers and searches "Movies" and "TV Shows" library sections
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
play_media_tv("living_room", "Inception")
// Result: "Found 'Inception' (movie) and launched Plex app on Living Room TV."
```

### Bedroom TV Playback

```typescript
// Search for The Matrix in main bedroom
play_media_tv("main_bed", "The Matrix")
// Result: "Found 'The Matrix' (movie) and launched Plex app on Bedroom TV."
```

## Error Handling

The tool provides structured error responses:

### Invalid Location

```text
Error: Location "kitchen" is not supported. Supported locations: living_room, main_bed
```

### No Media Found

```text
No media found matching "nonexistent movie" in Plex libraries
```

### Configuration Missing

```text
Error: Plex configuration is required to search media libraries
```

### Device Unavailable

```text
Error: Location "living_room" but no actions are available for location "living_room". Please check device configuration.
```

## Technical Details

### Dependencies

- **Plex API**: HTTP REST API for media search and metadata
- **Home Assistant**: WebSocket API for device control and Plex integration
- **Device Mapping**: Hard-coded configuration mapping locations to capabilities

### Execution Conditions

| HA Entity | HA Plex Entity | Actions Performed |
|-----------|----------------|-------------------|
| ✅ Available | ✅ Available | Power control + App launch + Direct playback |
| ✅ Available | ❌ Missing | Power control + App launch |
| ❌ Missing | ✅ Available | Direct playback |
| ❌ Missing | ❌ Missing | Error: no actions available |

### Security Considerations

- Plex API tokens are long-lived and should be protected
- Home Assistant access tokens require appropriate permissions
- Device mappings contain sensitive infrastructure identifiers

## Future Enhancements

### Planned Capabilities

- Direct Plex API navigation using configured client identifiers (bypassing Home Assistant)
- Multi-device casting support
- Watch history integration
- Playlist creation via Plex API
- Content recommendation based on viewing patterns

### Configuration Flexibility

- Dynamic device discovery and mapping
- User-configurable location definitions
- Support for additional media sources beyond Plex
