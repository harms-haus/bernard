import type {
  AutomationEvent,
  AutomationEventName,
  AutomationEventData,
  AutomationRegistryEntry
} from "./types";
import { getAutomationRegistry } from "./registry";
import { enqueueAutomationJob } from "./queue";
import { childLogger, logger } from "../logging";

const log = childLogger({ component: "hook_service" }, logger);

/**
 * HookService provides a centralized way to raise events that trigger automations.
 * Events are queued for processing by registered automations.
 */
export class HookService {
  private registry: Map<string, AutomationRegistryEntry> = new Map();
  private initialized = false;

  constructor() {
    // Initialize registry on first use
  }

  /**
   * Refresh the automation registry from the registry service
   */
  private async refreshRegistry(): Promise<void> {
    try {
      this.registry = await getAutomationRegistry();
      // log.debug("Refreshed automation registry", { count: this.registry.size });
    } catch (err) {
      // log.error("Failed to refresh automation registry", { error: String(err) });
    }
  }

  /**
   * Raise an event that will be processed by registered automations.
   * Only enabled automations that subscribe to the event will be triggered.
   */
  async raiseEvent(eventName: AutomationEventName, eventData: AutomationEventData): Promise<void> {
    if (!this.initialized) {
      await this.refreshRegistry();
      this.initialized = true;
    }
    const event: AutomationEvent = {
      name: eventName,
      data: eventData,
      timestamp: Date.now()
    };

    // log.debug("Raising event", {
    //   eventName,
    //   automationCount: this.registry.size,
    //   eventData: { ...eventData, messageContent: eventData.messageContent?.slice(0, 50) + "..." }
    // });

    // Find all enabled automations that subscribe to this event
    const matchingAutomations = Array.from(this.registry.values())
      .filter(entry => entry.settings.enabled && entry.automation.hooks.includes(eventName));

    if (matchingAutomations.length === 0) {
      // log.debug("No matching automations for event", { eventName });
      return;
    }

    // log.info("Triggering automations for event", {
    //   eventName,
    //   automationCount: matchingAutomations.length,
    //   automationIds: matchingAutomations.map(a => a.automation.id)
    // });

    // Queue jobs for each matching automation
    const queuePromises = matchingAutomations.map(entry => {
      return enqueueAutomationJob(entry.automation.id, event)
        .catch(err => {
          // log.error("Failed to enqueue automation job", {
          //   automationId: entry.automation.id,
          //   eventName,
          //   error: String(err)
          // });
        });
    });

    await Promise.allSettled(queuePromises);
  }

  /**
   * Get the current automation registry (for testing/debugging)
   */
  getRegistry(): Map<string, AutomationRegistryEntry> {
    return new Map(this.registry);
  }

  /**
   * Force refresh of the registry (useful for testing)
   */
  refresh(): void {
    this.refreshRegistry();
  }
}

// Singleton instance
let hookServiceInstance: HookService | null = null;

/**
 * Get the singleton HookService instance
 */
export function getHookService(): HookService {
  if (!hookServiceInstance) {
    hookServiceInstance = new HookService();
  }
  return hookServiceInstance;
}

/**
 * Convenience function to raise an event using the singleton service
 */
export async function raiseEvent(eventName: AutomationEventName, eventData: AutomationEventData): Promise<void> {
  const service = getHookService();
  return service.raiseEvent(eventName, eventData);
}
