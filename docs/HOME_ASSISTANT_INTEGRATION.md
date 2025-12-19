# Home Assistant Integration for Bernard

This document summarizes the Home Assistant tooling integration implemented for the Bernard AI assistant.

## Overview

The Home Assistant integration adds two new tools to Bernard that allow it to interact with Home Assistant entities:

1. **`list_ha_services`** - Lists all available Home Assistant entities with their current states and aliases
2. **`execute_services`** - Executes services on Home Assistant devices (e.g., turn lights on/off, adjust thermostats)

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

#### 3. List Services Tool (`ha-list-services.ts`)
- **Purpose**: Returns formatted list of available Home Assistant entities
- **Schema**: No input parameters required
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

#### 1. router Harness Integration
- **File**: `routerHarness.ts`
- **Changes**: Updated to call `haContextManager.updateFromMessages()` before each iteration
- **Purpose**: Ensures Home Assistant context is current with conversation state

#### 2. Tool Registration
- **File**: `tools/index.ts`
- **Changes**: Added `listHAServicesTool` and `executeServicesTool` to the router tools array
- **Purpose**: Makes HA tools available to the agent for selection

#### 3. API Response Handling
- **File**: `api/v1/chat/completions/route.ts`
- **Changes**: Modified to include Home Assistant service calls in tool_calls array
- **Purpose**: Returns service calls to Home Assistant for execution

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

#### List Available Services
```json
{
  "name": "list_ha_services",
  "arguments": {}
}
```

**Response**: Formatted list of entities with states and aliases.

#### Execute Services
```json
{
  "name": "execute_services",
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

**Response**: Confirmation messages for each scheduled service call.

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
              "name": "execute_services",
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

### Error Handling
- Validation errors are thrown immediately (not returned as messages)
- Allows proper error handling in the agent loop
- Invalid entity IDs or domain mismatches result in tool call failures

## Testing

### Unit Tests (`ha-tools.test.ts`)
- **25 tests** covering all core functionality
- Entity parsing from CSV format
- Context extraction from messages
- Entity lookup by ID and alias
- Entity ID validation
- Domain extraction
- Tool functionality
- Service call recording

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
- ✅ Service call recording and retrieval
- ✅ Error handling for invalid inputs
- ✅ Context management lifecycle

## Files Created/Modified

### New Files
1. `agent/harness/router/tools/ha-entities.ts` - Entity parsing and utilities
2. `agent/harness/router/tools/ha-list-services.ts` - List services tool
3. `agent/harness/router/tools/ha-execute-services.ts` - Execute services tool
4. `agent/harness/router/tools/ha-context.ts` - Context management
5. `tests/ha-tools.test.ts` - Unit tests (25 tests)
6. `tests/ha-simple-integration.test.ts` - Integration tests (5 tests)

### Modified Files
1. `agent/harness/router/tools/index.ts` - Added HA tools to registry
2. `agent/harness/router/routerHarness.ts` - Integrated context updates
3. `app/api/v1/chat/completions/route.ts` - Added HA service call handling

## Implementation Notes

### Design Decisions
1. **CSV Format**: Chose CSV for easy parsing and clear structure
2. **Validation**: Strict validation prevents invalid Home Assistant calls
3. **Context Management**: Global context manager for simplicity and testability
4. **Error Handling**: Throw errors for validation failures, return messages for execution results
5. **Tool Design**: Follow existing Bernard tool patterns for consistency

### Performance Considerations
- Entity parsing is done once per conversation turn
- Context updates are lightweight operations
- Service call recording is minimal overhead
- No external API calls during tool execution (returns immediately)

### Future Enhancements
- Support for more complex service data structures
- Entity state updates after service execution
- Caching of entity lists for performance
- Support for Home Assistant areas and device classes
- Integration with Home Assistant authentication

## Usage in Production

### Requirements
- Home Assistant must provide entities in the specified CSV format
- System prompts must include the `Available Devices:` section
- Entity IDs must follow Home Assistant naming conventions

### Deployment
1. Deploy the updated Bernard codebase
2. Ensure Home Assistant integration provides properly formatted system prompts
3. Test with sample conversations to verify tool functionality
4. Monitor logs for any validation or parsing errors

### Monitoring
- Watch for entity parsing failures in logs
- Monitor tool call success rates
- Check for validation errors in service calls
- Verify service calls are properly recorded and returned to Home Assistant

## Conclusion

The Home Assistant integration successfully adds two powerful tools to Bernard:
- **Entity Discovery**: `list_ha_services` allows users to see what devices are available
- **Device Control**: `execute_services` enables users to control Home Assistant devices through natural language

The implementation follows Bernard's existing patterns and includes comprehensive testing to ensure reliability. The integration is designed to be robust, with proper validation and error handling throughout.