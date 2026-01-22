# Model Configuration Refactor Plan

**Created:** 2025-01-21
**Status:** Draft
**Author:** Bernard AI Platform

## Overview

Refactor the model configuration system to support per-agent model assignments. Currently, models are organized by functional category (response, router, utility, etc.), which doesn't align with how models are actually used by different agents. This refactor introduces an agent-centric model configuration that allows each agent to define its own model roles (e.g., main, planner, executor) with user-friendly labels.

## Goals

1. Enable agents to declare their own model requirements
2. Provide user-friendly labels for model roles (not technical category names)
3. Support multi-model agents (like the planned Dexter agent)
4. Maintain a dedicated utility model for system-wide tasks
5. Clean up the outdated category-based model configuration
6. Refactor the UI to show per-agent sections with 3-column grid layout

## Non-Goals

- Automatic migration from old settings to new
- Auto-discovery of agents from langgraph.json
- Auto-detection of agents (must be manually registered)
- Default model configurations from the old system

## Background

### Current Architecture

The current model configuration uses functional categories:

```typescript
type ModelCategory = "response" | "router" | "aggregation" | "utility" | "memory" | "embedding";
```

Each category maps to a specific use case, but this doesn't reflect how models are actually assigned to agents. For example:
- Bernard agent uses the "router" category
- Gertrude agent uses the "router" category
- Utility jobs use the "utility" category

This creates confusion because:
1. The category name doesn't indicate which agent uses it
2. Multiple agents share the same category (router), making it unclear which model belongs to which agent
3. Agents can't define their own model requirements
4. Multi-model agents (like Dexter) aren't supported

### Current UI Structure

The current `/bernard/admin/models` page has:
1. Providers section
2. Model Assignment section with all categories displayed in a 3-column grid

Categories displayed: Response, Router, Utility, Aggregation, Embedding

## Proposed Architecture

### Agent Model Definitions

Create a manually-registered agent model definition system. Each agent declares:

```typescript
interface AgentModelDefinition {
  name: string;           // Display name (e.g., "Bernard")
  agentId: string;        // Graph ID (e.g., "bernard_agent")
  description?: string;   // Optional description of the agent
  modelRoles: ModelRoleDefinition[];
}

interface ModelRoleDefinition {
  id: string;             // Technical ID (e.g., "main")
  label: string;          // User-friendly label (e.g., "Main Model")
  description: string;    // Description of what this model is used for
  required: boolean;      // Whether this model is required
}
```

### Agent Registry

Agents are manually registered in a central registry:

```typescript
// core/src/lib/config/agentModelRegistry.ts

export const AGENT_MODEL_REGISTRY = [
  {
    name: "Bernard",
    agentId: "bernard_agent",
    description: "Primary AI assistant with full tool access",
    modelRoles: [
      {
        id: "main",
        label: "Main Model",
        description: "Primary model for reasoning and responses",
        required: true
      }
    ]
  },
  {
    name: "Gertrude",
    agentId: "gertrude_agent",
    description: "Guest-only assistant with limited tool access",
    modelRoles: [
      {
        id: "main",
        label: "Main Model",
        description: "Primary model for guest conversations",
        required: true
      }
    ]
  },
  // Future: Dexter will be added here when implemented
] as const;

export function getAgentDefinition(agentId: string): AgentModelDefinition | undefined {
  return AGENT_MODEL_REGISTRY.find(a => a.agentId === agentId);
}

export function listAgentDefinitions(): readonly AgentModelDefinition[] {
  return AGENT_MODEL_REGISTRY;
}
```

### New Settings Schema

```typescript
// core/src/lib/config/appSettings.ts

// Provider schema (unchanged)
export const ProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["openai", "ollama"]),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastTestedAt: z.string().optional(),
  testStatus: z.enum(["untested", "working", "failed"]).optional(),
  testError: z.string().optional()
});

// Utility model for system-wide tasks
export const UtilityModelSchema = z.object({
  primary: z.string().min(1),
  providerId: z.string().min(1),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional()
  }).optional()
});

// Agent-specific model role configuration
export const AgentModelRoleSchema = z.object({
  id: z.string().min(1),
  primary: z.string().min(1),
  providerId: z.string().min(1),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional()
  }).optional()
});

// Agent model configuration
export const AgentModelsSchema = z.object({
  agentId: z.string().min(1),
  roles: z.array(AgentModelRoleSchema)
});

// Updated ModelsSettings schema
export const ModelsSettingsSchema = z.object({
  providers: z.array(ProviderSchema),
  utility: UtilityModelSchema,
  agents: z.array(AgentModelsSchema)
});
```

### Model Resolution API

```typescript
// core/src/lib/config/models.ts

/**
 * Resolve a model configuration for a specific agent and role.
 * 
 * @param agentId - The agent's graph ID (e.g., "bernard_agent")
 * @param roleId - The role ID within the agent (e.g., "main")
 * @param opts - Optional override for fallback behavior
 * @returns Resolved model ID and call options
 */
export async function resolveModel(
  agentId: string,
  roleId: string,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<{ id: string; options: Partial<Record<string, any>> }>;

/**
 * Resolve the utility model for system-wide tasks.
 * 
 * @param opts - Optional override for fallback behavior
 * @returns Resolved model ID and call options
 */
export async function resolveUtilityModel(
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<{ id: string; options: Partial<Record<string, any>> }>;
```

## Implementation Tasks

### Phase 1: Data Layer Changes

#### Task 1.1: Create Agent Model Registry

**File:** `core/src/lib/config/agentModelRegistry.ts`

- Define `AgentModelDefinition` interface
- Define `ModelRoleDefinition` interface
- Create `AGENT_MODEL_REGISTRY` constant with Bernard and Gertrude definitions
- Export helper functions: `getAgentDefinition()`, `listAgentDefinitions()`

**Acceptance Criteria:**
- Registry contains Bernard and Gertrude agents
- Each agent has at least one model role (main)
- Helper functions work correctly
- TypeScript compilation passes

#### Task 1.2: Update Settings Schema

**File:** `core/src/lib/config/appSettings.ts`

- Remove old category schemas: `ModelCategorySchema`
- Add new schemas: `UtilityModelSchema`, `AgentModelRoleSchema`, `AgentModelsSchema`
- Update `ModelsSettingsSchema` to use new structure
- Update type exports: `ModelCategorySettings` → `UtilityModelSettings`, `AgentModelSettings`, etc.

**Acceptance Criteria:**
- Schema validates new structure
- All related type exports updated
- Tests pass

#### Task 1.3: Update Model Resolution

**File:** `core/src/lib/config/models.ts`

- Change `resolveModel()` signature from `resolveModel(category, opts)` to `resolveModel(agentId, roleId, opts)`
- Add `resolveUtilityModel()` function
- Update `getPrimaryModel()` and `getModelList()` to use new signature
- Update `resolveBaseUrl()` and `resolveApiKey()` logic

**Acceptance Criteria:**
- All existing calls updated to new signature
- TypeScript compilation passes
- Unit tests pass

#### Task 1.4: Update Settings Store

**File:** `core/src/lib/config/settingsStore.ts`

- Update `getModels()` return type
- Update `setModels()` parameter type
- Update `getDefaultModels()` to return new structure

**Acceptance Criteria:**
- Store operations work with new schema
- Tests pass

### Phase 2: Agent Code Updates

#### Task 2.1: Update Bernard Agent

**File:** `core/src/agents/bernard/bernard.agent.ts`

- Change `resolveModel("router")` to `resolveModel("bernard_agent", "main")`

**Before:**
```typescript
const { id, options } = await deps.resolveModel("router");
```

**After:**
```typescript
const { id, options } = await deps.resolveModel("bernard_agent", "main");
```

#### Task 2.2: Update Gertrude Agent

**File:** `core/src/agents/gertrude/gertrude.agent.ts`

- Change `resolveModel("router")` to `resolveModel("gertrude_agent", "main")`

#### Task 2.3: Update Utility Jobs

**File:** `core/src/lib/infra/thread-naming-job.ts`

- Change `resolveModel("utility")` to `resolveUtilityModel()`

### Phase 3: API Updates

#### Task 3.1: Update Admin API Types

**File:** `core/src/services/adminApi.ts`

- Update `ModelCategorySettings` to `UtilityModelSettings`
- Add `AgentModelRoleSettings` interface
- Add `AgentModelSettings` interface
- Update `ModelsSettings` interface

#### Task 3.2: Update Models API Route

**File:** `core/src/app/api/admin/models/route.ts`

- Update GET handler to return new schema
- Update PUT handler to accept new schema
- Update schema validation

### Phase 4: UI Refactor

#### Task 4.1: Refactor Models Page Layout

**File:** `core/src/app/(dashboard)/bernard/admin/models/page.tsx`

**New Structure:**

```
Providers Section (keep as-is)
  ↓
Utility Model Section (NEW)
  ↓
Agent Sections (NEW, alphabetical order)
  ├─ Bernard Card
  │   └─ 3-column grid with Main Model configurator
  └─ Gertrude Card
      └─ 3-column grid with Main Model configurator
```

**Layout Requirements:**
- Utility section: single model configurator in 3-column grid
- Each agent section: one card per agent
- Each agent card: 3-column grid, one column per model role
- Even single-model agents display in 3-column grid (empty columns as placeholders)

**Render Logic:**

```typescript
// Get agents sorted alphabetically by name
const sortedAgents = [...AGENT_MODEL_REGISTRY].sort((a, b) => 
  a.name.localeCompare(b.name)
);

// Render each agent section
{sortedAgents.map(agent => (
  <Card key={agent.agentId}>
    <CardHeader>
      <CardTitle>{agent.name}</CardTitle>
      {agent.description && <CardDescription>{agent.description}</CardDescription>}
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {agent.modelRoles.map(role => (
          <AgentModelRoleConfigurator
            agentId={agent.agentId}
            roleId={role.id}
            roleLabel={role.label}
            roleDescription={role.description}
            settings={settings}
            onUpdate={handleUpdate}
          />
        ))}
      </div>
    </CardContent>
  </Card>
))}
```

#### Task 4.2: Create Model Role Configurator Component

**File:** `core/src/components/AgentModelRoleConfigurator.tsx` (NEW)

- Accepts agentId, roleId, roleLabel, roleDescription
- Renders provider selector and model selector
- Shows role label and description
- Handles changes and notifies parent

#### Task 4.3: Update Utility Model Section

- Render single model configurator for utility model
- Label: "Utility Model"
- Description: "Used for system tasks like auto-renaming and summarization"

### Phase 5: Testing

#### Task 5.1: Update Unit Tests

**Files:**
- `core/src/lib/config/models.test.ts`
- `core/src/lib/config/appSettings.test.ts`
- `core/src/app/(dashboard)/bernard/admin/models/page.test.tsx`

- Update model resolution tests to use new signature
- Update schema validation tests
- Update UI component tests

#### Task 5.2: Create Integration Tests

**Test Scenarios:**
1. Resolve Bernard model
2. Resolve Gertrude model
3. Resolve utility model
4. Full settings save/load cycle
5. UI renders all agent sections

### Phase 6: Documentation

#### Task 6.1: Update AGENTS.md

**File:** `core/src/AGENTS.md`

- Document new model configuration structure
- Document how to add new agents
- Document how to add new model roles to existing agents

#### Task 6.2: Update README.md

**File:** `core/README.md` (or main README)

- Document model configuration changes
- Update screenshots if applicable

## File Changes Summary

| File | Type | Description |
|------|------|-------------|
| `core/src/lib/config/agentModelRegistry.ts` | NEW | Agent model registry with Bernard and Gertrude definitions |
| `core/src/lib/config/appSettings.ts` | MODIFY | Update schema for new model structure |
| `core/src/lib/config/models.ts` | MODIFY | Update resolveModel signature and add resolveUtilityModel |
| `core/src/lib/config/settingsStore.ts` | MODIFY | Update types for new schema |
| `core/src/agents/bernard/bernard.agent.ts` | MODIFY | Use new resolveModel signature |
| `core/src/agents/gertrude/gertrude.agent.ts` | MODIFY | Use new resolveModel signature |
| `core/src/lib/infra/thread-naming-job.ts` | MODIFY | Use resolveUtilityModel |
| `core/src/services/adminApi.ts` | MODIFY | Update type interfaces |
| `core/src/app/api/admin/models/route.ts` | MODIFY | Handle new schema |
| `core/src/app/(dashboard)/bernard/admin/models/page.tsx` | REFACTOR | New per-agent UI layout |
| `core/src/components/AgentModelRoleConfigurator.tsx` | NEW | Component for configuring model roles |
| `core/src/lib/config/models.test.ts` | MODIFY | Update tests |
| `core/src/lib/config/appSettings.test.ts` | MODIFY | Update tests |
| `core/src/app/(dashboard)/bernard/admin/models/page.test.tsx` | MODIFY | Update tests |
| `core/src/AGENTS.md` | MODIFY | Document new structure |

## Rollout Plan

1. **Deploy new schema** - Backend changes only, no user-facing impact
2. **Deploy agent updates** - Bernard and Gertrude start using new model resolution
3. **Deploy UI changes** - New model configuration page with agent sections
4. **Update documentation** - Document new configuration system

## Backward Compatibility

This is a breaking change. Users will need to reconfigure their model settings after the upgrade. There is no automatic migration from the old category-based configuration.

## Future Considerations

When adding the Dexter agent:

1. Add Dexter to `AGENT_MODEL_REGISTRY` with all its model roles
2. Create the agent implementation in `core/src/agents/dexter/`
3. Add to `langgraph.json`
4. UI will automatically show Dexter section on next refresh

No other changes required for new agents.

## Open Questions

None. All questions answered by stakeholder.

## Approval

- [ ] Technical Lead Approval
- [ ] Stakeholder Approval
