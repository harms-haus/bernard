
/**
 * Configuration annotation for configurable parameters.
 */
import { Annotation } from "@langchain/langgraph";

export const BernardConfigurationAnnotation = Annotation.Root({});

export type BernardConfiguration = typeof BernardConfigurationAnnotation.State;
