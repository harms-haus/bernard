import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Save } from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import type { ServicesSettings } from '../../services/adminApi';
import { useToast } from '../../components/ToastManager';

export default function Services() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ServicesSettings | null>(null);

  // Hook calls - must be at the top level of the component function
  const toast = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settingsData = await adminApiClient.getServicesSettings();
      setSettings(settingsData);
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error('Failed to load services settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    setSaving(true);
    try {
      const updatedSettings = await adminApiClient.updateServicesSettings(settings);
      setSettings(updatedSettings);
      toast.success('Services settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to save services settings: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (updates: Partial<ServicesSettings>) => {
    setSettings(prev => prev ? { ...prev, ...updates } : null);
  };

  const updateWeatherSettings = (weatherUpdates: Partial<ServicesSettings['weather']>) => {
    setSettings(prev => prev ? {
      ...prev,
      weather: { ...prev.weather, ...weatherUpdates }
    } : null);
  };

  const updateHomeAssistantSettings = (haUpdates: Partial<NonNullable<ServicesSettings['homeAssistant']>>) => {
    setSettings(prev => {
      if (!prev) return null;
      const currentHA = prev.homeAssistant || { baseUrl: '' };
      return {
        ...prev,
        homeAssistant: { ...currentHA, ...haUpdates }
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Services Configuration</h1>
          <p className="text-gray-600 dark:text-gray-300">Configure external service integrations</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Home Assistant Section */}
      <Card>
        <CardHeader>
          <CardTitle>Home Assistant</CardTitle>
          <CardDescription>Connect Bernard to your Home Assistant instance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ha-baseUrl">Base URL</Label>
              <Input
                id="ha-baseUrl"
                type="url"
                value={settings?.homeAssistant?.baseUrl || ''}
                onChange={(e) => updateHomeAssistantSettings({ baseUrl: e.target.value })}
                placeholder="https://home-assistant.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ha-accessToken">Access Token</Label>
              <Input
                id="ha-accessToken"
                type="password"
                value={settings?.homeAssistant?.accessToken || ''}
                onChange={(e) => updateHomeAssistantSettings({ accessToken: e.target.value })}
                placeholder="Long-lived access token"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weather Section */}
      <Card>
        <CardHeader>
          <CardTitle>Weather Service</CardTitle>
          <CardDescription>Configure weather data provider for location-based weather queries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="weather-provider">Provider</Label>
              <select
                id="weather-provider"
                value={settings?.weather?.provider || 'open-meteo'}
                onChange={(e) => updateWeatherSettings({ provider: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="open-meteo">Open-Meteo (Free, no API key)</option>
                <option value="openweathermap">OpenWeatherMap</option>
                <option value="weatherapi">WeatherAPI.com</option>
              </select>
            </div>

            {settings?.weather?.provider === 'openweathermap' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weather-apiKey">API Key *</Label>
                    <Input
                      id="weather-apiKey"
                      type="password"
                      value={settings.weather.apiKey || ''}
                      onChange={(e) => updateWeatherSettings({ apiKey: e.target.value })}
                      placeholder="OpenWeatherMap API key"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weather-apiUrl">API URL *</Label>
                    <Input
                      id="weather-apiUrl"
                      type="url"
                      value={settings.weather.apiUrl || ''}
                      onChange={(e) => updateWeatherSettings({ apiUrl: e.target.value })}
                      placeholder="https://api.openweathermap.org/data/2.5/weather"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {settings?.weather?.provider === 'weatherapi' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weather-apiKey">API Key *</Label>
                    <Input
                      id="weather-apiKey"
                      type="password"
                      value={settings.weather.apiKey || ''}
                      onChange={(e) => updateWeatherSettings({ apiKey: e.target.value })}
                      placeholder="WeatherAPI.com API key"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weather-apiUrl">API URL *</Label>
                    <Input
                      id="weather-apiUrl"
                      type="url"
                      value={settings.weather.apiUrl || ''}
                      onChange={(e) => updateWeatherSettings({ apiUrl: e.target.value })}
                      placeholder="https://api.weatherapi.com/v1"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {settings?.weather?.provider === 'open-meteo' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weather-forecastUrl">Forecast URL</Label>
                    <Input
                      id="weather-forecastUrl"
                      type="url"
                      value={settings.weather.forecastUrl || ''}
                      onChange={(e) => updateWeatherSettings({ forecastUrl: e.target.value })}
                      placeholder="https://api.open-meteo.com/v1/forecast"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weather-historicalUrl">Historical URL</Label>
                    <Input
                      id="weather-historicalUrl"
                      type="url"
                      value={settings.weather.historicalUrl || ''}
                      onChange={(e) => updateWeatherSettings({ historicalUrl: e.target.value })}
                      placeholder="https://archive-api.open-meteo.com/v1/archive"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="weather-timeoutMs">Timeout (ms)</Label>
              <Input
                id="weather-timeoutMs"
                type="number"
                value={settings?.weather?.timeoutMs || ''}
                onChange={(e) => updateWeatherSettings({ timeoutMs: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="12000"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SearXNG Section */}
      <Card>
        <CardHeader>
          <CardTitle>SearXNG</CardTitle>
          <CardDescription>Configure SearXNG metasearch engine for web search functionality</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search-apiUrl">API URL *</Label>
              <Input
                id="search-apiUrl"
                type="url"
                value={settings?.search?.apiUrl || ''}
                onChange={(e) => updateSettings({
                  search: { ...settings!.search, apiUrl: e.target.value }
                })}
                placeholder="https://searxng.example.com/search"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="search-apiKey">API Key</Label>
              <Input
                id="search-apiKey"
                type="password"
                value={settings?.search?.apiKey || ''}
                onChange={(e) => updateSettings({
                  search: { ...settings!.search, apiKey: e.target.value }
                })}
                placeholder="Optional API key"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Geocoding Section */}
      <Card>
        <CardHeader>
          <CardTitle>Geocoding</CardTitle>
          <CardDescription>Configure geocoding service for location lookups</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="geocoding-url">API URL</Label>
              <Input
                id="geocoding-url"
                type="url"
                value={settings?.geocoding?.url || ''}
                onChange={(e) => updateSettings({
                  geocoding: { ...settings!.geocoding, url: e.target.value }
                })}
                placeholder="https://nominatim.openstreetmap.org/search"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="geocoding-userAgent">User Agent *</Label>
              <Input
                id="geocoding-userAgent"
                value={settings?.geocoding?.userAgent || ''}
                onChange={(e) => updateSettings({
                  geocoding: { ...settings!.geocoding, userAgent: e.target.value }
                })}
                placeholder="bernard-assistant/1.0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="geocoding-email">Contact Email</Label>
              <Input
                id="geocoding-email"
                type="email"
                value={settings?.geocoding?.email || ''}
                onChange={(e) => updateSettings({
                  geocoding: { ...settings!.geocoding, email: e.target.value }
                })}
                placeholder="ops@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="geocoding-referer">Referer</Label>
              <Input
                id="geocoding-referer"
                type="url"
                value={settings?.geocoding?.referer || ''}
                onChange={(e) => updateSettings({
                  geocoding: { ...settings!.geocoding, referer: e.target.value }
                })}
                placeholder="https://example.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
