import type { BaseMessage } from "@langchain/core/messages";
import type { HomeAssistantContext, HomeAssistantEntity, HomeAssistantServiceCall } from "./ha-entities";
import { extractHomeAssistantContext, findEntity, validateEntityId, getDomainFromEntityId } from "./ha-entities";

/**
 * Home Assistant context manager for maintaining state during conversation
 */
export class HomeAssistantContextManager {
  private context: HomeAssistantContext | null = null;
  private serviceCalls: HomeAssistantServiceCall[] = [];
  
  /**
  * Update context from conversation messages
  */
  updateFromMessages(messages: BaseMessage[]): void {
    console.log(`[HA DEBUG] updateFromMessages called with ${messages.length} messages`);
    const newContext = extractHomeAssistantContext(messages);
    
    console.log(`[HA DEBUG] extractHomeAssistantContext result: ${newContext ? `entities: ${newContext.entities.length}` : 'null'}`);
    
    if (newContext) {
      // Merge with existing context if available
      if (this.context) {
        this.context.entities = newContext.entities;
        this.context.lastUpdated = new Date();
      } else {
        this.context = newContext;
      }
      console.log(`[HA DEBUG] Context updated successfully`);
    } else {
      console.log(`[HA DEBUG] No HA context found in messages`);
    }
  }
  
  /**
   * Get current Home Assistant context
   */
  getContext(): HomeAssistantContext | null {
    return this.context;
  }
  
  /**
   * Get entities from current context
   */
  getEntities(): HomeAssistantEntity[] {
    return this.context?.entities || [];
  }
  
  /**
   * Find entity by entity_id or alias
   */
  findEntity(identifier: string): HomeAssistantEntity | undefined {
    return findEntity(this.getEntities(), identifier);
  }
  
  /**
   * Record a service call
   */
  recordServiceCall(serviceCall: HomeAssistantServiceCall): void {
    this.serviceCalls.push({
      ...serviceCall,
      service_data: {
        ...serviceCall.service_data
      }
    });
  }
  
  /**
   * Get recorded service calls
   */
  getRecordedServiceCalls(): HomeAssistantServiceCall[] {
    return [...this.serviceCalls];
  }
  
  /**
   * Clear recorded service calls
   */
  clearServiceCalls(): void {
    this.serviceCalls = [];
  }
  
  /**
   * Clear the entire context (for testing)
   */
  clearContext(): void {
    this.context = null;
    this.serviceCalls = [];
  }
  
  /**
   * Validate entity_id format
   */
  validateEntityId(entityId: string): boolean {
    return validateEntityId(entityId);
  }
  
  /**
   * Get domain from entity_id
   */
  getDomainFromEntityId(entityId: string): string | null {
    return getDomainFromEntityId(entityId);
  }
  
  /**
   * Check if Home Assistant context is available
   */
  hasContext(): boolean {
    return this.context !== null && this.context.entities.length > 0;
  }
  
  /**
   * Get context summary for debugging
   */
  getContextSummary(): string {
    if (!this.context) {
      return "No Home Assistant context available.";
    }
    
    const entityCount = this.context.entities.length;
    const serviceCallCount = this.serviceCalls.length;
    
    return `Home Assistant Context:
- Entities: ${entityCount}
- Recorded Service Calls: ${serviceCallCount}
- Last Updated: ${this.context.lastUpdated.toISOString()}`;
  }
}
