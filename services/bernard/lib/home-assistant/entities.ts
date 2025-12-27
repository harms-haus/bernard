import type { BaseMessage } from "@langchain/core/messages";

/**
 * Home Assistant entity representation
 */
export interface HomeAssistantEntity {
  entity_id: string;
  name: string;
  state: string;
  aliases: string[];
  attributes?: Record<string, unknown>;
}

/**
 * Home Assistant service call representation
 */
export interface HomeAssistantServiceCall {
  domain: string;
  service: string;
  service_data: Record<string, unknown> & {
    entity_id: string | string[];
  };
}

/**
 * Home Assistant context extracted from system prompts
 */
export interface HomeAssistantContext {
  entities: HomeAssistantEntity[];
  services: HomeAssistantServiceCall[];
  lastUpdated: Date;
}

/**
 * Parse Home Assistant entities from system prompt text
 * Looks for CSV format: entity_id,name,state,aliases
 */
export function parseHomeAssistantEntities(systemPrompt: string): HomeAssistantEntity[] {
  const entities: HomeAssistantEntity[] = [];
  
  // Look for the CSV pattern in the system prompt
  const csvPattern = /Available Devices:\s*```csv\s*([\s\S]*?)```/i;
  const match = systemPrompt.match(csvPattern);
  
  if (!match || !match[1]) {
    return entities;
  }
  
  const csvContent = match[1];
  
  // Parse CSV lines (skip header)
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    return entities;
  }
  
  // Skip header line and parse each entity
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    
    try {
      const entity = parseEntityFromCSVLine(line);
      if (entity) {
        entities.push(entity);
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }
  
  return entities;
}

/**
 * Parse a single CSV line into an entity
 */
function parseEntityFromCSVLine(line: string): HomeAssistantEntity | null {
  // Handle CSV parsing with proper quote handling
  const fields = parseCSVLine(line);
  
  if (fields.length < 4) {
    return null;
  }
  
  const [entity_id, name, state, aliasesStr] = fields;

  // Validate required fields
  if (!entity_id || !entity_id.includes('.') || !name || !state) {
    return null;
  }

  const aliases = aliasesStr ? aliasesStr.split('/').map(a => a.trim()).filter(Boolean) : [];

  return {
    entity_id: entity_id.trim(),
    name: name.trim(),
    state: state.trim(),
    aliases
  };
}

/**
 * Parse a single CSV line with proper quote handling
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add the last field
  fields.push(current);
  
  return fields;
}

/**
 * Extract Home Assistant context from conversation messages
 */
export function extractHomeAssistantContext(messages: BaseMessage[]): HomeAssistantContext | null {
  // Look for system messages that might contain HA entities
  for (const message of messages) {
    const messageType = (message as { type: string }).type;
    if (messageType === 'system') {
      const content = extractContentFromMessage(message);
      if (content) {
        const entities = parseHomeAssistantEntities(content);
        if (entities.length > 0) {
          return {
            entities,
            services: [],
            lastUpdated: new Date()
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract content from a BaseMessage
 */
function extractContentFromMessage(message: BaseMessage): string | null {
  const content = (message as { content?: unknown }).content;
  
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  
  return null;
}

/**
 * Find entity by entity_id or alias
 */
export function findEntity(
  entities: HomeAssistantEntity[], 
  identifier: string
): HomeAssistantEntity | undefined {
  const normalized = identifier.toLowerCase();
  
  // First try exact match on entity_id
  const exactMatch = entities.find(e => e.entity_id.toLowerCase() === normalized);
  if (exactMatch) return exactMatch;
  
  // Then try aliases
  return entities.find(e => 
    e.aliases.some(alias => alias.toLowerCase() === normalized)
  );
}

/**
 * Validate entity_id format (must start with domain, followed by dot)
 */
export function validateEntityId(entityId: string): boolean {
  return /^[a-z_]+[a-z0-9_]*\.[a-z0-9_]+$/.test(entityId);
}

/**
 * Get domain from entity_id
 */
export function getDomainFromEntityId(entityId: string): string | null {
  const parts = entityId.split('.');
  return parts.length >= 2 && parts[0] ? parts[0] : null;
}

/**
 * Format entities for display
 */
export function formatEntitiesForDisplay(entities: HomeAssistantEntity[]): string {
  if (entities.length === 0) {
    return "No Home Assistant entities available.";
  }
  
  const lines = entities.map(entity => {
    const aliases = entity.aliases.length > 0 ? ` (aliases: ${entity.aliases.join(', ')})` : '';
    return `- ${entity.entity_id}: ${entity.name} (state: ${entity.state})${aliases}`;
  });
  
  return `Available Home Assistant entities:\n${lines.join('\n')}`;
}