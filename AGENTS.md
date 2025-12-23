# AGENTS.md

AI coding agent instructions for **bernard**

## Project Overview

**Project Type:** Node.js Application
**Primary Language:** TypeScript (74% of codebase)
**Secondary Languages:** JavaScript (26%)

## Architecture

**Project Structure:**
- `docs/` - Documentation
- `bernard/` - Main application codebase
- `bernard-ui/` - Frontend interface
- `docs/agent/` - Agent architecture documentation
- `docs/plans/` - Temporary implementation plans and specifications
- `docs/records/` - RecordKeeper and other documents about recording
- `docs/ui/admin/` - Admin area documentation
- `docs/ui/frontend/` - Non-admin area documentation
- `docs/ui/user/` - User profile and settings
- `docs/temp/` - Temporary documentation about fixes, summaries, etc. ONLY write these if requested.

## Core Architecture Patterns

### Harness-Based Agent Architecture

Bernard implements a **harness-based agent architecture** where each component of the conversation flow is encapsulated in specialized, composable modules called "harnesses."

#### Harness Pattern Components

**Core Harnesses:**
- **Router Harness** (`bernard/agent/harness/router/`) - Determines which tools need to be executed based on user input
- **Response Harness** (`bernard/agent/harness/respond/`) - Generates natural language responses after tool execution
- **Utility Harness** (`bernard/agent/harness/utility/`) - Placeholder for general-purpose tools

**Orchestration Layer:**
- **Streaming Orchestrator** (`bernard/agent/loop/orchestrator.ts`) - Coordinates harness execution and manages conversation state

**Streaming Infrastructure:**
- **Delegate Sequencer** (`bernard/agent/streaming/delegateSequencer.ts`) - Chains async generators for real-time event streaming
- **Streaming Types** (`bernard/agent/streaming/types.ts`) - Standardized event contracts for harness communication

#### Harness Behavior Contract

Each harness implements the following pattern:
```typescript
// Standard harness interface
interface Harness<TIn, TOut> { 
  run(input: TIn, ctx: HarnessContext): Promise<HarnessResult<TOut>>; 
}

// Event streaming pattern for real-time updates
async function* runHarnessWithStreaming(input, context) {
  // Yield events as they occur, not after completion
  yield { type: 'llm_call', context: buildPrompt(input) };
  // ... processing
  yield { type: 'delta', delta: 'partial result' };
  // ... more processing
  return finalResult;
}
```

### Key Design Principles

1. **Stateless Graph**: Conversation flow alternates between model output and tool execution until completion, then streams partial tokens as `text/event-stream`
2. **Composable Components**: Each harness has a single responsibility and can be composed together
3. **Real-time Streaming**: Events are emitted immediately as they occur, not buffered for batch processing
4. **Token-gated Access**: Authentication handled at the API layer with bearer tokens
5. **Event-driven Architecture**: All internal communication uses standardized event types

## Documentation Categories

**Architecture Documentation:**
- [Harness Architecture](docs/agent/harnesses/router.md) - Router harness implementation details
- [Response Harness](docs/agent/harnesses/response.md) - Response generation patterns
- [Streaming Architecture](docs/agent/delegate-streaming.md) - Real-time event streaming design
- [Orchestrator](docs/agent/orchestrator.md) - Conversation coordination logic

**Integration Guides:**
- [Home Assistant Integration](docs/HOME_ASSISTANT_INTEGRATION.md) - Device integration patterns

## Build, Test, and Run

### Prerequisites
- Node.js LTS + npm
- Environment configuration (copy sample env and fill required keys)

### Development Commands
```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build production
npm run build && npm run start

# Code quality
npm run lint

# Tests
npm run tests

# Test with coverage
npm run tests:coverage

# Queue worker
npm run queues:worker
```

### Testing Strategy
- Unit tests for individual harnesses with mocked LLM callers
- Integration tests for orchestrator sequencing
- Streaming behavior tests with fake async generators
- End-to-end API route testing

## Code Style Guidelines

### TypeScript Conventions
- Use camelCase for variables and functions
- Use PascalCase for classes and components
- Prefer const/let over var
- Use async/await over callbacks when possible
- Type all function parameters and return values

### Harness Implementation Standards
- Always implement the streaming pattern for real-time updates
- Prefer yielding events immediately rather than buffering
- Use standardized event types defined in `streaming/types.ts`
- Maintain single responsibility per harness
- Keep harnesses stateless and composable

### Error Handling
- Yield error events immediately when they occur
- Never catch errors that should propagate to the client
- Use structured error types for consistent handling
- Implement graceful fallbacks in response harness

## Documentation Maintenance

### Critical Documentation Principle

**When code and documentation disagree, update the documentation to reflect the current behavior.** Documentation must always accurately represent how the system currently works, not how it was designed or how it should work.

### Documentation Guidelines

1. **Timeless Descriptions**: Describe how the system currently works, not how it evolved
   - ❌ "The new router harness replaces the legacy routing system"
   - ✅ "The router harness determines which tools to execute based on user input"

2. **Current State Focus**: Document the present implementation
   - ❌ "This was upgraded from a callback-based system"
   - ✅ "The system uses async generators for real-time event streaming"

3. **Behavioral Accuracy**: Documentation must match actual behavior
   - When making code changes that affect behavior, update all related documentation
   - When updating documentation, verify it matches the current implementation
   - Remove outdated examples and replace with current patterns

4. **Example Usage**: Use existing code as examples, not prescriptions
   - Document patterns that are actually used in the codebase
   - Keep examples minimal and focused on the documented concept
   - Update examples when underlying patterns change

### Documentation Categories to Maintain

- **Architecture patterns** - Keep harness contracts and relationships current
- **API specifications** - Update when endpoints or behaviors change
- **Implementation plans** - Mark completed items and remove outdated strategies
- **Integration guides** - Keep device and service integration instructions accurate
- **Code examples** - Ensure all examples compile and work as documented

## AI Coding Assistance Notes

### Important Considerations

- Check package.json for available scripts before running commands
- Be aware of Node.js version requirements
- Consider impact on bundle size when adding dependencies
- Project has 472 files across 131 directories
- Check build configuration files before making structural changes

### When to Ask Questions

**Ask when:**
- Genuine ambiguities exist in requirements or implementation
- Missing required parameters for successful task completion
- Complex intent clarification is needed beyond available context

**Don't ask when:**
- Minor details can be resolved through available tools
- Answers are findable via search or file examination
- Information has already been provided in the request
- Sufficient context exists to proceed confidently

### Code Change Protocol

1. **Understand existing patterns** before modifying code
2. **Update documentation** when code behavior changes
3. **Maintain backward compatibility** where possible
4. **Follow established harness patterns** for new functionality
5. **Test streaming behavior** for real-time features

---

*This AGENTS.md file defines the current architecture and patterns for the bernard project. Update it as the project evolves to maintain accuracy and usefulness.*