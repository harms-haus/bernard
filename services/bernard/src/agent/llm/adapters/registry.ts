import type { ModelAdapter } from "./adapter.interface";

/**
 * Registry for model adapters
 * 
 * Adapters register themselves, and the factory finds which
 * adapters to apply based on the model name.
 */
export class AdapterRegistry {
  private adapters: ModelAdapter[] = [];
  private autoRegister: () => void = () => {};

  /**
   * Set the auto-registration function to be called when clearing the registry
   * 
   * @param fn - Function that re-registers auto-registered adapters
   */
  setAutoRegister(fn: () => void): void {
    this.autoRegister = fn;
  }

  /**
   * Register an adapter
   * 
   * @param adapter - The adapter to register
   */
  register(adapter: ModelAdapter): void {
    const existing = this.adapters.find((a) => a.name === adapter.name);
    if (existing) {
      throw new Error(`Adapter "${adapter.name}" is already registered`);
    }
    this.adapters.push(adapter);
  }

  /**
   * Find all adapters that apply to the given model name
   * 
   * @param modelName - The model name to check
   * @returns Array of applicable adapters (ordered by registration)
   */
  findFor(modelName: string): ModelAdapter[] {
    return this.adapters.filter((adapter) => adapter.appliesTo(modelName));
  }

  /**
   * Get all registered adapters (for testing/debugging)
   */
  all(): ModelAdapter[] {
    return [...this.adapters];
  }

  /**
   * Clear all registered adapters and re-register auto-registered adapters
   */
  clear(): void {
    this.adapters = [];
    this.autoRegister();
  }
}

/**
 * Singleton registry instance
 */
export const adapterRegistry = new AdapterRegistry();
