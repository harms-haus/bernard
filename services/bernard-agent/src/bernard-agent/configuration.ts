/**
 * Default system prompt for Bernard voice assistant.
 */
export const BERNARD_SYSTEM_PROMPT = `You are Bernard, a helpful AI voice assistant.

Current Time: {time}

Your personality:
- Helpful, friendly, and concise
- You have access to tools for home automation, web search, weather, Wikipedia, and more
- When you need to take action, use the appropriate tools

You are a voice assistant, so keep responses natural and conversational.`;

/**
 * Configuration annotation for configurable parameters.
 */
import { Annotation } from "@langchain/langgraph";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export const BernardConfigurationAnnotation = Annotation.Root({
  /**
   * User ID for HA entity scoping.
   */
  userId: Annotation<string>({
    reducer: (state, input) => input ?? state,
    default: () => "default",
  }),

  /**
   * The language model to use for the routing agent (with tools).
   */
  reactModel: Annotation<string>({
    reducer: (state, input) => input ?? state,
    default: () => "anthropic/claude-3-7-sonnet-latest",
  }),

  /**
   * The language model to use for response generation (no tools).
   */
  responseModel: Annotation<string>({
    reducer: (state, input) => input ?? state,
    default: () => "anthropic/claude-3-7-sonnet-latest",
  }),

  /**
   * System prompt template.
   */
  systemPrompt: Annotation<string>({
    reducer: (state, input) => input ?? state,
    default: () => BERNARD_SYSTEM_PROMPT,
  }),

  /**
   * Home Assistant configuration (if available).
   */
  homeAssistantConfig: Annotation<{
    baseUrl: string;
    accessToken: string;
  } | null>({
    reducer: (state, input) => input ?? state,
    default: () => null,
  }),
});

export type BernardConfiguration = typeof BernardConfigurationAnnotation.State;

/**
 * Extract and validate configuration from RunnableConfig.
 */
export function ensureBernardConfiguration(
  config?: LangGraphRunnableConfig,
): BernardConfiguration {
  const configurable = config?.configurable || {};
  return {
    userId: configurable["userId"] || "default",
    reactModel: configurable["reactModel"] || "anthropic/claude-3-7-sonnet-latest",
    responseModel: configurable["responseModel"] || "anthropic/claude-3-7-sonnet-latest",
    systemPrompt: configurable["systemPrompt"] || BERNARD_SYSTEM_PROMPT,
    homeAssistantConfig: configurable["homeAssistantConfig"] || null,
  };
}
