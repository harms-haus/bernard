import type { BaseMessage, AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LLMConfig, LLMResponse } from "../llm";

/**
 * LLM call information passed to adapters for adaptation
 */
export interface AdapterCallInfo {
  messages: BaseMessage[];
  config: LLMConfig;
  tools?: StructuredToolInterface[];
}

/**
 * Result of adapting LLM call information
 */
export interface AdaptedCallInfo {
  messages: BaseMessage[];
  config: LLMConfig;
  tools?: StructuredToolInterface[];
}

/**
 * Interface for model adapters
 * 
 * Model adaptors handle model-specific formatting requirements that differ
 * from standard OpenAI-compatible APIs. For example, Mistral requires
 * tool call IDs to be 9 characters or fewer.
 * 
 * Adapters are discovered by the registry and applied automatically by
 * the LLM factory based on model name matching.
 */
export interface ModelAdapter {
  /**
   * Human-readable name for logging and debugging
   */
  readonly name: string;

  /**
   * Check if this adapter applies to the given model
   * 
   * @param modelName - The model name (e.g., "mistral-large", "gpt-4o")
   * @returns true if this adapter should be applied to this model
   */
  appliesTo(modelName: string): boolean;

  /**
   * Adapt LLM call information before sending to the LLM caller
   * 
   * This method can modify messages, config, or tools to meet the
   * specific model's requirements.
   * 
   * @param callInfo - The LLM call information to adapt
   * @returns Adapted call information
   */
  adapt(callInfo: AdapterCallInfo): AdaptedCallInfo;

  /**
   * Adapt the response back after receiving from the LLM caller
   * 
   * This reverses any transformations made during adapt(), such as
   * re-inflating compressed IDs or transforming response formats.
   * 
   * @param response - The LLM response (LLMResponse or AIMessage)
   * @returns Adapted response
   */
  adaptBack(response: LLMResponse | AIMessage): LLMResponse | AIMessage;
}

  /**
   * Abstract base class for adapters that need to track state
   * between adapt() and adaptBack() calls
   */
  export abstract class StatefulModelAdapter implements ModelAdapter {
    abstract readonly name: string;
    abstract appliesTo(modelName: string): boolean;

    /**
     * Internal state for tracking mappings between original and adapted values
     */
    protected state: Map<string, unknown> = new Map();

    protected getState<T>(key: string): T | undefined {
      return this.state.get(key) as T | undefined;
    }

    protected setState(key: string, value: unknown): void {
      this.state.set(key, value);
    }

    protected clearState(): void {
      this.state.clear();
    }

    /**
     * Get state value for testing purposes
     */
    getStateForTest<T>(key: string): T | undefined {
      return this.getState<T>(key);
    }

    abstract adapt(callInfo: AdapterCallInfo): AdaptedCallInfo;
    abstract adaptBack(response: LLMResponse | AIMessage): LLMResponse | AIMessage;
  }
