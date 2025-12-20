# Home Assistant Integration for Bernard

This document summarizes the Home Assistant tooling integration implemented for the Bernard AI assistant using the `home-assistant-js-websocket` library (v3.1.2).

## Overview

The Home Assistant integration adds three new tools to Bernard that allow it to interact with Home Assistant entities:

1. **`list_home_assistant_entities`** - Lists all available Home Assistant entities with their current states and aliases, with optional filtering by domain, regex, and visibility
2. **`execute_home_assistant_services`** - Executes services on Home Assistant devices (e.g., turn lights on/off, adjust thermostats)
3. **`get_historical_state`** - Retrieves historical state data for entities within a specified time range

## Architecture

### Core Components

#### 1. WebSocket Client (`ha-websocket-client.ts`)
- **Purpose**: Manages persistent WebSocket connections to Home Assistant instances
- **Features**:
  - Connection pooling per Home Assistant instance (keyed by baseUrl)
  - Automatic reconnection handling via library
  - Long-lived token authentication
  - Graceful connection lifecycle management
  - Singleton pattern for efficient resource usage

#### 2. Entity Parsing (`ha-entities.ts`)
- **Purpose**: Parses Home Assistant entities from system prompts in CSV format
- **Pattern**: Looks for `Available Devices:` followed by a CSV block with columns: `entity_id,name,state,aliases`
- **Features**:
  - CSV parsing with proper quote handling
  - Entity validation (must start with domain + dot)
  - Domain extraction from entity IDs
  - Alias support for easier entity lookup

#### 3. Context Management (`ha-context.ts`)
- **Purpose**: Maintains Home Assistant state during conversations
- **Features**:
  - Global context manager for entity storage
  - Service call recording
  - Entity lookup by ID or alias
  - Context clearing for testing

#### 4. List Entities Tool (`ha-list-entities.ts`)
- **Purpose**: Returns formatted list of available Home Assistant entities with optional filtering
- **Schema**:
  - `domain` (optional): Filter entities by domain (e.g., 'light', 'sensor')
  - `regex` (optional): Filter entities using regex pattern matching against 'entity_id, name, aliases, state' format
- **Output**: Human-readable list of entities with states and aliases
- **Features**:
  - WebSocket API integration for entity retrieval
  - Entity visibility filtering (hides entities marked as hidden by assistants)
  - Fallback to context manager when WebSocket unavailable

#### 5. Execute Services Tool (`ha-execute-services.ts`)
- **Purpose**: Executes Home Assistant services with WebSocket API preference
- **Schema**: Array of service calls with domain, service, and entity_id
- **Validation**:
  - Entity ID format validation (must start with domain)
  - Domain matching (entity domain must match service domain)
  - Immediate error throwing for validation failures
- **Behavior**: **Prefers WebSocket API execution over tool call recording**
- **Priority Logic**:
  1. If WebSocket configured → Execute directly via `callService()`
  2. Else if context available → Record for Home Assistant pipeline (fallback)
  3. Else → Error

#### 6. Historical State Tool (`ha-historical-state.ts`)
- **Purpose**: Retrieves historical state data for Home Assistant entities
- **Schema**:
  - `entity_ids`: Array of entity IDs to retrieve historical data for
  - `start_time`: Start time in ISO 8601 format
  - `end_time`: End time in ISO 8601 format
- **Features**:
  - WebSocket history API integration
  - REST API fallback if WebSocket history unavailable
  - Formatted output with timestamps and attribute changes

## Architecture

### Core Components

#### 1. Entity Parsing (`ha-entities.ts`)
- **Purpose**: Parses Home Assistant entities from system prompts in CSV format
- **Pattern**: Looks for `Available Devices:` followed by a CSV block with columns: `entity_id,name,state,aliases`
- **Features**:
  - CSV parsing with proper quote handling
  - Entity validation (must start with domain + dot)
  - Domain extraction from entity IDs
  - Alias support for easier entity lookup

#### 2. Context Management (`ha-context.ts`)
- **Purpose**: Maintains Home Assistant state during conversations
- **Features**:
  - Global context manager for entity storage
  - Service call recording
  - Entity lookup by ID or alias
  - Context clearing for testing

#### 3. List Entities Tool (`ha-list-entities.ts`)
- **Purpose**: Returns formatted list of available Home Assistant entities with optional filtering
- **Schema**:
  - `domain` (optional): Filter entities by domain (e.g., 'light', 'sensor')
  - `regex` (optional): Filter entities using regex pattern matching against 'entity_id, name, aliases, state' format
- **Output**: Human-readable list of entities with states and aliases
- **Behavior**: Only available when Home Assistant entities are present in context

#### 4. Execute Services Tool (`ha-execute-services.ts`)
- **Purpose**: Executes Home Assistant services with validation
- **Schema**: Array of service calls with domain, service, and entity_id
- **Validation**:
  - Entity ID format validation (must start with domain)
  - Domain matching (entity domain must match service domain)
  - Immediate error throwing for validation failures
- **Behavior**: Records service calls for Home Assistant to process

### Integration Points

#### 1. Connection Management
- **File**: `orchestrator.ts`
- **Changes**: Added `shutdown()` method that closes all WebSocket connections
- **Purpose**: Proper cleanup of persistent connections on application shutdown

#### 2. router Harness Integration
- **File**: `routerHarness.ts`
- **Changes**: Updated to call `haContextManager.updateFromMessages()` before each iteration
- **Purpose**: Ensures Home Assistant context is current with conversation state

#### 3. Tool Registration
- **File**: `tools/index.ts`
- **Changes**: Added `listHAEntitiesTool`, `executeServicesTool`, and `getHistoricalStateTool` to the router tools array
- **Purpose**: Makes HA tools available to the agent for selection

#### 4. API Response Handling
- **File**: `api/v1/chat/completions/route.ts`
- **Changes**: Modified to include Home Assistant service calls in tool_calls array
- **Purpose**: Returns service calls to Home Assistant for execution when API not available

### API Priority Behavior

The integration implements a clear priority hierarchy for Home Assistant operations:

1. **WebSocket API Preferred**: When Home Assistant WebSocket configuration is available, tools execute operations directly via the API
2. **Tool Call Fallback**: When WebSocket is not configured, service calls are recorded for Home Assistant's agentic pipeline to process
3. **Context Fallback**: For entity listing, context from system prompts is used when API unavailable

This design ensures maximum responsiveness while maintaining backward compatibility with existing Home Assistant integrations.

## Usage Examples

### System Prompt Format
Home Assistant entities are provided via system prompts in this format:

```
Available Devices:
```csv
entity_id,name,state,aliases
light.living_room,Living Room Light,on,main light/lamp
switch.kitchen,Kitchen Switch,off,light switch
sensor.temperature,Temperature Sensor,22.5,thermometer
```
```

### Tool Usage

#### List Available Entities
```json
{
  "name": "list_home_assistant_entities",
  "arguments": {}
}
```

**Response**: Formatted list of entities with states and aliases.

#### List Entities with Filtering
```json
{
  "name": "list_home_assistant_entities",
  "arguments": {
    "domain": "light"
  }
}
```

**Response**: Only entities in the 'light' domain.

```json
{
  "name": "list_home_assistant_entities",
  "arguments": {
    "regex": "living.*room"
  }
}
```

**Response**: Only entities matching the regex pattern.

#### Execute Home Assistant Services
```json
{
  "name": "execute_home_assistant_services",
  "arguments": {
    "list": [
      {
        "domain": "light",
        "service": "turn_off",
        "service_data": {
          "entity_id": "light.living_room"
        }
      },
      {
        "domain": "switch",
        "service": "turn_on",
        "service_data": {
          "entity_id": "switch.kitchen"
        }
      }
    ]
  }
}
```

**Response**: Confirmation messages for each executed service call (when using WebSocket API) or scheduled service call (when using tool call fallback).

#### Get Historical State
```json
{
  "name": "get_historical_state",
  "arguments": {
    "entity_ids": ["sensor.temperature", "light.living_room"],
    "start_time": "2024-01-01T00:00:00Z",
    "end_time": "2024-01-02T00:00:00Z"
  }
}
```

**Response**: Historical state data showing state changes and attribute updates for the specified entities within the time range.

### API Response Format
When Home Assistant service calls are made, they are included in the API response:

```json
{
  "id": "request-id",
  "object": "chat.completion",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "I've scheduled the requested changes to your devices.",
        "tool_calls": [
          {
            "id": "ha_service_call_0",
            "type": "function",
            "function": {
              "name": "execute_home_assistant_services",
              "arguments": "{\"list\":[{\"domain\":\"light\",\"service\":\"turn_off\",\"service_data\":{\"entity_id\":\"light.living_room\"}}]}"
            }
          }
        ]
      }
    }
  ]
}
```

## Validation Rules

### Entity ID Format
- Must start with domain name
- Followed by a dot character
- Then the entity identifier
- Pattern: `^[a-z_]+[a-z0-9_]*\.[a-z0-9_]+$`
- Examples: `light.living_room`, `switch.kitchen`, `sensor.temperature`

### Domain Matching
- Service domain must match entity domain
- Example: `light.turn_on` service can only be called on entities starting with `light.`
- Prevents invalid service calls like `light.turn_on` on `switch.kitchen`

### Entity Visibility
- Entities marked as hidden by assistants are filtered out
- Checks `attributes.hidden_by` for values like `"assistant"` or `"cloud"`
- Only filters if visibility information is easily accessible (no extra API calls)

### Error Handling
- Validation errors are thrown immediately (not returned as messages)
- Allows proper error handling in the agent loop
- Invalid entity IDs or domain mismatches result in tool call failures
- WebSocket connection errors provide clear diagnostic messages

## Testing

### Unit Tests (`ha-tools.test.ts`)
- **29 tests** covering all core functionality
- Entity parsing from CSV format
- Context extraction from messages
- Entity lookup by ID and alias
- Entity ID validation
- Domain extraction
- Tool functionality with WebSocket mocking
- Service call recording and API preference logic
- Historical state retrieval
- WebSocket connection error handling

### Integration Tests (`ha-simple-integration.test.ts`)
- **5 tests** covering end-to-end workflows
- Entity parsing → context management → tool execution
- Alias-based entity lookup
- Entity ID validation
- Domain extraction
- Entity formatting

### Test Coverage
- ✅ CSV parsing with various formats
- ✅ Entity validation and lookup
- ✅ Tool invocation and response handling
- ✅ WebSocket API preference over tool calls
- ✅ Service call recording and retrieval (fallback behavior)
- ✅ Historical state data retrieval
- ✅ Entity visibility filtering
- ✅ Error handling for invalid inputs and connection failures
- ✅ Context management lifecycle
- ✅ Connection pooling behavior

## Files Created/Modified

### New Files
1. `agent/harness/router/tools/ha-websocket-client.ts` - WebSocket connection pool manager
2. `agent/harness/router/tools/ha-entities.ts` - Entity parsing and utilities
3. `agent/harness/router/tools/ha-list-entities.ts` - List entities tool with WebSocket API and visibility filtering
4. `agent/harness/router/tools/ha-execute-services.ts` - Execute services tool with WebSocket API preference
5. `agent/harness/router/tools/ha-historical-state.ts` - Historical state retrieval tool
6. `agent/harness/router/tools/ha-context.ts` - Context management
7. `tests/ha-tools.test.ts` - Unit tests (29 tests)
8. `tests/ha-simple-integration.test.ts` - Integration tests (5 tests)

### Modified Files
1. `agent/harness/router/tools/index.ts` - Added HA tools to registry including historical state tool
2. `agent/harness/router/routerHarness.ts` - Integrated context updates
3. `agent/loop/orchestrator.ts` - Added WebSocket connection cleanup on shutdown
4. `app/api/v1/chat/completions/route.ts` - Added HA service call handling
5. `package.json` - Added home-assistant-js-websocket dependency

## Implementation Notes

### Design Decisions
1. **WebSocket API Priority**: Direct API calls preferred over tool call recording for maximum responsiveness
2. **Connection Pooling**: Persistent connections per Home Assistant instance for efficiency
3. **CSV Format**: Maintained for backward compatibility with existing system prompt formats
4. **Entity Visibility**: Automatic filtering of assistant-hidden entities without performance impact
5. **Validation**: Strict validation prevents invalid Home Assistant calls
6. **Context Management**: Global context manager for simplicity and testability
7. **Error Handling**: Throw errors for validation failures, return messages for execution results
8. **Tool Design**: Follow existing Bernard tool patterns for consistency

### Performance Considerations
- WebSocket connections are persistent and reused across requests
- Entity parsing is done once per conversation turn
- Context updates are lightweight operations
- Service calls execute immediately when API available (no recording delay)
- Entity visibility filtering only applies when data is already available
- Connection pooling reduces overhead of repeated authentication

### Future Enhancements
- Support for more complex service data structures
- Real-time entity state subscriptions for live updates
- Enhanced caching of entity lists for performance
- Support for Home Assistant areas and device classes
- Advanced historical data analysis features
- Integration with Home Assistant scenes and automations

## Usage in Production

### Requirements
- Home Assistant instance with WebSocket API enabled (default)
- Long-lived access token configured in Bernard settings
- Home Assistant must provide entities in the specified CSV format (for fallback)
- System prompts must include the `Available Devices:` section (for fallback)
- Entity IDs must follow Home Assistant naming conventions

### Configuration
Home Assistant connection is configured via environment variables or settings:
```json
{
  "services": {
    "homeAssistant": {
      "baseUrl": "http://homeassistant.local:8123",
      "accessToken": "your-long-lived-access-token"
    }
  }
}
```

### Deployment
1. Install the updated Bernard codebase with WebSocket dependencies
2. Configure Home Assistant base URL and access token
3. Test WebSocket connectivity and tool functionality
4. Monitor connection health and automatic reconnection behavior

### Monitoring
- Watch for WebSocket connection events in logs
- Monitor tool call success rates (direct API vs tool call fallback)
- Check for entity visibility filtering effectiveness
- Verify historical data retrieval performance
- Monitor connection pool usage and cleanup

## Conclusion

The Home Assistant integration successfully adds three powerful tools to Bernard with WebSocket-first architecture:
- **Entity Discovery**: `list_home_assistant_entities` provides comprehensive device visibility with filtering and automatic assistant-hiding
- **Device Control**: `execute_home_assistant_services` enables immediate device control via WebSocket API with tool call fallback
- **Historical Analysis**: `get_historical_state` allows users to analyze device behavior over time

The implementation leverages the official Home Assistant WebSocket library for reliable, real-time integration while maintaining backward compatibility. Connection pooling ensures efficiency, and comprehensive testing validates all functionality including error handling and API preference logic.