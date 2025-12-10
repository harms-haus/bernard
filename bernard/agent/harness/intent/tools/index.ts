import { geocodeSearchTool } from "./geocode";
import { memorizeTool } from "./memorize";
import { webSearchTool } from "./web-search";
import {
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
} from "@/libs/weather";

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


