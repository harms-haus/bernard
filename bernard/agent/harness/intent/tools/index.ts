import type { IntentTool } from "../intent.harness";
import { geocodeSearchTool } from "./geocode";
import { memorizeTool } from "./memorize";
import { webSearchTool } from "./web-search";
import { getWeatherCurrentTool } from "./weather-current";
import { getWeatherForecastTool } from "./weather-forecast";
import { getWeatherHistoricalTool } from "./weather-historical";
import { createListHAServicesToolInstance } from "./ha-list-services";
import { createExecuteServicesToolInstance } from "./ha-execute-services";
import type { HomeAssistantContextManager } from "./ha-context";

type LangChainTool = {
  name?: string;
  description?: string;
  schema?: unknown;
  invoke?: (input: Record<string, unknown>) => Promise<unknown>;
  call?: (input: Record<string, unknown>) => Promise<unknown>;
  verifyConfiguration?: () => { ok: boolean; reason?: string } | Promise<{ ok: boolean; reason?: string }>;
};

function adaptToIntentTool(tool: unknown): IntentTool {
  const lcTool = tool as LangChainTool;
  const name = lcTool.name ?? "tool";
  const description = lcTool.description;
  const schema = lcTool.schema;
  const verifyConfiguration =
    typeof lcTool.verifyConfiguration === "function"
      ? async () => lcTool.verifyConfiguration!()
      : undefined;

  const invoke = async (input: Record<string, unknown>) => {
    if (typeof lcTool.invoke === "function") return lcTool.invoke(input);
    if (typeof lcTool.call === "function") return lcTool.call(input);
    throw new Error(`Tool ${name} cannot be invoked`);
  };

  return {
    name,
    ...(description ? { description } : {}),
    ...(schema !== undefined ? { schema } : {}),
    invoke,
    ...(verifyConfiguration ? { verifyConfiguration } : {})
  };
}

export function getIntentTools(haContextManager?: HomeAssistantContextManager): IntentTool[] {
  const baseTools = [
    webSearchTool,
    geocodeSearchTool,
    memorizeTool,
    getWeatherCurrentTool,
    getWeatherForecastTool,
    getWeatherHistoricalTool
  ];

  const haTools = haContextManager ? [
    createListHAServicesToolInstance(haContextManager),
    createExecuteServicesToolInstance(haContextManager)
  ] : [];

  return [...baseTools, ...haTools].map((tool) => adaptToIntentTool(tool));
}

export {
  geocodeSearchTool,
  memorizeTool,
  webSearchTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool,
  createListHAServicesToolInstance,
  createExecuteServicesToolInstance
};


