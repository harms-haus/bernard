// Weather API utilities
export {
  getForecastApiUrl,
  getHistoricalApiUrl,
  getWeatherTimeoutMs,
  fetchWeatherJson,
  weatherError,
  resolveUnits,
  likelyImperial,
  chooseUnits,
  parseTarget,
  parseDateRange,
  getImperialUnits
} from '@/lib/weather/common';

export type {
  UnitChoice,
  DailyWeather,
  HourlyWeather,
  WeatherFetchResult
} from '@/lib/weather/common';

// Geocoding utilities
export {
  loadGeocodeConfig,
  buildGeocodeUrl,
  geocodeLocation,
  formatGeocodeResults
} from '@/lib/weather/geocoding';

export type {
  GeocodeConfig,
  GeocodeResult
} from '@/lib/weather/geocoding';
