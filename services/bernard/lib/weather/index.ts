// Weather API utilities
export {
  getForecastApiUrl,
  getHistoricalApiUrl,
  getWeatherTimeoutMs,
  fetchWeatherJson,
  weatherError,
  resolveUnits,
  likelyImperial
} from "./common";

export type {
  UnitChoice,
  DailyWeather,
  HourlyWeather,
  WeatherFetchResult
} from "./common";

// Geocoding utilities
export {
  loadGeocodeConfig,
  buildGeocodeUrl,
  geocodeLocation,
  formatGeocodeResults
} from "./geocoding";

export type {
  GeocodeConfig,
  GeocodeResult
} from "./geocoding";
