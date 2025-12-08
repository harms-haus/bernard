import { geocodeSearchTool } from "./geocode";
import { timerTool } from "./timer";
import { webSearchTool } from "./web-search";
import {
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
} from "@/libs/weather";

export const tools = [
  webSearchTool,
  timerTool,
  geocodeSearchTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
];

export {
  geocodeSearchTool,
  timerTool,
  webSearchTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
};



