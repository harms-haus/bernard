/**
 * Agent Model Registry
 * 
 * Defines all agents and their model requirements. This registry is used by:
 * - The UI to render agent-specific model configuration sections
 * - The model resolution system to validate agent/role combinations
 * 
 * To add a new agent:
 * 1. Add the agent definition to AGENT_MODEL_REGISTRY
 * 2. Register the agent in langgraph.json
 * 3. Update the agent code to use resolveModel(agentId, roleId)
 */

import { z } from "zod";

/**
 * Definition of a model role within an agent
 */
export interface ModelRoleDefinition {
  /** Technical ID used in code and config (e.g., "main", "planner") */
  id: string;
  /** User-friendly display label (e.g., "Main Model", "Planner Model") */
  label: string;
  /** Description of what this model is used for */
  description: string;
  /** Whether this model is required for the agent to function */
  required: boolean;
}

/**
 * Definition of an agent's model configuration requirements
 */
export interface AgentModelDefinition {
  /** User-friendly display name (e.g., "Bernard", "Gertrude") */
  name: string;
  /** Graph ID as defined in langgraph.json (e.g., "bernard_agent") */
  agentId: string;
  /** Optional description of the agent's purpose */
  description?: string;
  /** List of model roles this agent requires */
  modelRoles: readonly ModelRoleDefinition[];
}

/**
 * Zod schema for validating agent model definitions
 */
export const AgentModelDefinitionSchema = z.object({
  name: z.string().min(1),
  agentId: z.string().min(1),
  description: z.string().optional(),
  modelRoles: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    required: z.boolean(),
  })),
});

/**
 * Registry of all agents and their model requirements
 * 
 * IMPORTANT: This is a breaking change from the old category-based configuration.
 * Users will need to reconfigure their model settings after upgrading.
 */
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
        required: true,
      },
    ],
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
        required: true,
      },
    ],
  },
  // Future agents can be added here:
  // {
  //   name: "Dexter",
  //   agentId: "dexter_agent",
  //   description: "Multi-model agent with planning capabilities",
  //   modelRoles: [
  //     { id: "planner", label: "Planner Model", description: "High-capability model for complex planning", required: true },
  //     { id: "executor", label: "Executor Model", description: "Fast model for tool execution", required: true },
  //   ],
  // },
] as const;

/**
 * Get the agent model definition for a specific agent ID
 * 
 * @param agentId - The agent's graph ID (e.g., "bernard_agent")
 * @returns The agent definition if found, undefined otherwise
 */
export function getAgentDefinition(agentId: string): AgentModelDefinition | undefined {
  const found = AGENT_MODEL_REGISTRY.find(a => a.agentId === agentId);
  // Convert from readonly to mutable for compatibility
  return found ? {
    name: found.name,
    agentId: found.agentId,
    description: found.description,
    modelRoles: [...found.modelRoles],
  } : undefined;
}

/**
 * Get a specific model role definition for an agent
 * 
 * @param agentId - The agent's graph ID
 * @param roleId - The role ID within the agent
 * @returns The role definition if found, undefined otherwise
 */
export function getAgentRoleDefinition(
  agentId: string,
  roleId: string
): ModelRoleDefinition | undefined {
  const agent = getAgentDefinition(agentId);
  if (!agent) return undefined;
  return agent.modelRoles.find(r => r.id === roleId);
}

/**
 * List all registered agent definitions
 * 
 * @returns Readonly array of all agent definitions (sorted alphabetically by name)
 */
export function listAgentDefinitions(): readonly AgentModelDefinition[] {
  return [...AGENT_MODEL_REGISTRY].sort((a, b) => 
    a.name.localeCompare(b.name)
  );
}

/**
 * Check if an agent ID is registered
 * 
 * @param agentId - The agent's graph ID to check
 * @returns true if the agent is registered, false otherwise
 */
export function isRegisteredAgent(agentId: string): boolean {
  return AGENT_MODEL_REGISTRY.some(a => a.agentId === agentId);
}

/**
 * Get all required model role IDs for an agent
 * 
 * @param agentId - The agent's graph ID
 * @returns Array of required role IDs
 */
export function getRequiredRoleIds(agentId: string): string[] {
  const agent = getAgentDefinition(agentId);
  if (!agent) return [];
  return agent.modelRoles.filter(r => r.required).map(r => r.id);
}
