import { geocodeSearchTool } from "./geocode";
import { memorizeTool } from "./memorize";
import { webSearchTool } from "./web-search";
import { getWeatherCurrentTool } from "./weather-current";
import { getWeatherForecastTool } from "./weather-forecast";
import { getWeatherHistoricalTool } from "./weather-historical";

export const intentTools = [
  webSearchTool,
  geocodeSearchTool,
  memorizeTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
];

export {
  geocodeSearchTool,
  memorizeTool,
  webSearchTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
};


