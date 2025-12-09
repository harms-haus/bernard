import { geocodeSearchTool } from "./geocode";
import { memorizeTool } from "./memorize";
import { timerTool } from "./timer";
import { webSearchTool } from "./web-search";
import {
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
} from "@/libs/weather";

export const intentTools = [
  webSearchTool,
  timerTool,
  geocodeSearchTool,
  memorizeTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
];

export {
  geocodeSearchTool,
  memorizeTool,
  timerTool,
  webSearchTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
};


