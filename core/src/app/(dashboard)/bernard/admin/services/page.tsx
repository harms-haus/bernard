"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';
import { adminApiClient } from '@/services/adminApi';
import type { ServicesSettings } from '@/services/adminApi';
import { useToast } from '@/components/ToastManager';
import { ServiceTestButton, type ServiceTestStatus } from '@/components/ui/service-test-button';
import { AdminLayout } from '@/components/AdminLayout';

// Deep merge helper to preserve nested objects during updates
function ServicesContent() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ServicesSettings | null>(null);

  const [haTestStatus, setHaTestStatus] = useState<ServiceTestStatus>('idle');
  const [haTestError, setHaTestError] = useState<string>('');
  const [haTestErrorType, setHaTestErrorType] = useState<string>('');
  const [plexTestStatus, setPlexTestStatus] = useState<ServiceTestStatus>('idle');
  const [plexTestError, setPlexTestError] = useState<string>('');
  const [plexTestErrorType, setPlexTestErrorType] = useState<string>('');
  const [ttsTestStatus, setTtsTestStatus] = useState<ServiceTestStatus>('idle');
  const [ttsTestError, setTtsTestError] = useState<string>('');
  const [ttsTestErrorType, setTtsTestErrorType] = useState<string>('');
  const [sttTestStatus, setSttTestStatus] = useState<ServiceTestStatus>('idle');
  const [sttTestError, setSttTestError] = useState<string>('');
  const [sttTestErrorType, setSttTestErrorType] = useState<string>('');
  const [overseerrTestStatus, setOverseerrTestStatus] = useState<ServiceTestStatus>('idle');
  const [overseerrTestError, setOverseerrTestError] = useState<string>('');
  const [overseerrTestErrorType, setOverseerrTestErrorType] = useState<string>('');

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
    setSettings(prev => {
      if (!prev) return null;
      const merged = { ...prev } as unknown as Record<string, unknown>;
      for (const key of Object.keys(updates)) {
        const sourceValue = updates[key as keyof Partial<ServicesSettings>];
        const targetValue = prev[key as keyof ServicesSettings];
        if (sourceValue !== null && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
            targetValue !== null && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
          merged[key] = { ...targetValue, ...sourceValue };
        } else if (sourceValue !== undefined) {
          merged[key] = sourceValue;
        }
      }
      return merged as unknown as ServicesSettings;
    });
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

  const updatePlexSettings = (plexUpdates: Partial<NonNullable<ServicesSettings['plex']>>) => {
    setSettings(prev => {
      if (!prev) return null;
      const currentPlex = prev.plex || { baseUrl: '', token: '' };
      return {
        ...prev,
        plex: { ...currentPlex, ...plexUpdates }
      };
    });
  };

  const updateTtsSettings = (ttsUpdates: Partial<NonNullable<ServicesSettings['tts']>>) => {
    setSettings(prev => {
      if (!prev) return null;
      const currentTts = prev.tts || { baseUrl: '' };
      return {
        ...prev,
        tts: { ...currentTts, ...ttsUpdates }
      };
    });
  };

  const updateSttSettings = (sttUpdates: Partial<NonNullable<ServicesSettings['stt']>>) => {
    setSettings(prev => {
      if (!prev) return null;
      const currentStt = prev.stt || { baseUrl: '' };
      return {
        ...prev,
        stt: { ...currentStt, ...sttUpdates }
      };
    });
  };

  const updateOverseerrSettings = (overseerrUpdates: Partial<NonNullable<ServicesSettings['overseerr']>>) => {
    setSettings(prev => {
      if (!prev) return null;
      const currentOverseerr = prev.overseerr || { baseUrl: '', apiKey: '' };
      return {
        ...prev,
        overseerr: { ...currentOverseerr, ...overseerrUpdates }
      };
    });
  };

  const runHomeAssistantTest = useCallback(async (showNotification = false) => {
    if (!settings?.homeAssistant?.baseUrl) {
      if (showNotification) toast.error('Please enter a Home Assistant URL first');
      setHaTestStatus('failed');
      setHaTestError('Please enter a Home Assistant URL first');
      setHaTestErrorType('configuration');
      return;
    }

    setHaTestStatus('loading');
    setHaTestError('');
    setHaTestErrorType('');

    try {
      const result = await adminApiClient.testHomeAssistantConnection({
        baseUrl: settings.homeAssistant.baseUrl,
        accessToken: settings.homeAssistant.accessToken
      });

      if (result.status === 'success') {
        setHaTestStatus('success');
        if (showNotification) toast.success('Home Assistant connection successful!');
      } else {
        setHaTestStatus(result.errorType as ServiceTestStatus || 'failed');
        setHaTestError(result.error || 'Unknown error');
        setHaTestErrorType(result.errorType || 'unknown');
        if (showNotification) toast.error(`Home Assistant: ${result.error || 'Connection failed'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setHaTestStatus('failed');
      setHaTestError(errorMessage);
      setHaTestErrorType('unknown');
      console.error('Failed to test Home Assistant connection:', error);
      if (showNotification) toast.error(`Home Assistant: ${errorMessage}`);
    }
  }, [settings, toast]);

  const runPlexTest = useCallback(async (showNotification = false) => {
    if (!settings?.plex?.baseUrl || !settings?.plex?.token) {
      if (showNotification) toast.error('Please enter Plex URL and token first');
      setPlexTestStatus('failed');
      setPlexTestError('Please enter Plex URL and token first');
      setPlexTestErrorType('configuration');
      return;
    }

    setPlexTestStatus('loading');
    setPlexTestError('');
    setPlexTestErrorType('');

    try {
      const result = await adminApiClient.testPlexConnection({
        baseUrl: settings.plex.baseUrl,
        token: settings.plex.token
      });

      if (result.status === 'success') {
        setPlexTestStatus('success');
        if (showNotification) toast.success('Plex connection successful!');
      } else {
        setPlexTestStatus(result.errorType as ServiceTestStatus || 'failed');
        setPlexTestError(result.error || 'Unknown error');
        setPlexTestErrorType(result.errorType || 'unknown');
        if (showNotification) toast.error(`Plex: ${result.error || 'Connection failed'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setPlexTestStatus('failed');
      setPlexTestError(errorMessage);
      setPlexTestErrorType('unknown');
      console.error('Failed to test Plex connection:', error);
    }
  }, [settings, toast]);

  const runTtsTest = useCallback(async (showNotification = false) => {
    if (!settings?.tts?.baseUrl) {
      if (showNotification) toast.error('Please enter a TTS URL first');
      setTtsTestStatus('failed');
      setTtsTestError('Please enter a TTS URL first');
      setTtsTestErrorType('configuration');
      return;
    }

    setTtsTestStatus('loading');
    setTtsTestError('');
    setTtsTestErrorType('');

    try {
      const result = await adminApiClient.testTtsConnection({
        baseUrl: settings.tts.baseUrl,
        apiKey: settings.tts.apiKey
      });

      if (result.status === 'success') {
        setTtsTestStatus('success');
        if (showNotification) toast.success('TTS connection successful!');
      } else {
        setTtsTestStatus(result.errorType as ServiceTestStatus || 'failed');
        setTtsTestError(result.error || 'Unknown error');
        setTtsTestErrorType(result.errorType || 'unknown');
        if (showNotification) toast.error(`TTS: ${result.error || 'Connection failed'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setTtsTestStatus('failed');
      setTtsTestError(errorMessage);
      setTtsTestErrorType('unknown');
      console.error('Failed to test TTS connection:', error);
    }
  }, [settings, toast]);

  const runSttTest = useCallback(async (showNotification = false) => {
    if (!settings?.stt?.baseUrl) {
      if (showNotification) toast.error('Please enter an STT URL first');
      setSttTestStatus('failed');
      setSttTestError('Please enter an STT URL first');
      setSttTestErrorType('configuration');
      return;
    }

    setSttTestStatus('loading');
    setSttTestError('');
    setSttTestErrorType('');

    try {
      const result = await adminApiClient.testSttConnection({
        baseUrl: settings.stt.baseUrl,
        apiKey: settings.stt.apiKey
      });

      if (result.status === 'success') {
        setSttTestStatus('success');
        if (showNotification) toast.success('STT connection successful!');
      } else {
        setSttTestStatus(result.errorType as ServiceTestStatus || 'failed');
        setSttTestError(result.error || 'Unknown error');
        setSttTestErrorType(result.errorType || 'unknown');
        if (showNotification) toast.error(`STT: ${result.error || 'Connection failed'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setSttTestStatus('failed');
      setSttTestError(errorMessage);
      setSttTestErrorType('unknown');
      console.error('Failed to test STT connection:', error);
    }
  }, [settings, toast]);

  const runOverseerrTest = useCallback(async (showNotification = false) => {
    if (!settings?.overseerr?.baseUrl || !settings?.overseerr?.apiKey) {
      if (showNotification) toast.error('Please enter Overseerr URL and API key first');
      setOverseerrTestStatus('failed');
      setOverseerrTestError('Please enter Overseerr URL and API key first');
      setOverseerrTestErrorType('configuration');
      return;
    }

    setOverseerrTestStatus('loading');
    setOverseerrTestError('');
    setOverseerrTestErrorType('');

    try {
      const result = await adminApiClient.testOverseerrConnection({
        baseUrl: settings.overseerr.baseUrl,
        apiKey: settings.overseerr.apiKey
      });

      if (result.status === 'success') {
        setOverseerrTestStatus('success');
        if (showNotification) toast.success('Overseerr connection successful!');
      } else {
        setOverseerrTestStatus(result.errorType as ServiceTestStatus || 'failed');
        setOverseerrTestError(result.error || 'Unknown error');
        setOverseerrTestErrorType(result.errorType || 'unknown');
        if (showNotification) toast.error(`Overseerr: ${result.error || 'Connection failed'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setOverseerrTestStatus('failed');
      setOverseerrTestError(errorMessage);
      setOverseerrTestErrorType('unknown');
      console.error('Failed to test Overseerr connection:', error);
    }
  }, [settings, toast]);

  useEffect(() => {
    if (!settings) return;
    if (settings.homeAssistant?.baseUrl && settings.homeAssistant?.accessToken && haTestStatus === 'idle') {
      runHomeAssistantTest(false);
    }
    if (settings.plex?.baseUrl && settings.plex?.token && plexTestStatus === 'idle') {
      runPlexTest(false);
    }
    if (settings.tts?.baseUrl && ttsTestStatus === 'idle') {
      runTtsTest(false);
    }
    if (settings.stt?.baseUrl && sttTestStatus === 'idle') {
      runSttTest(false);
    }
    if (settings.overseerr?.baseUrl && settings.overseerr?.apiKey && overseerrTestStatus === 'idle') {
      runOverseerrTest(false);
    }
  }, [settings]);

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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Home Assistant</CardTitle>
              <CardDescription>Connect Bernard to your Home Assistant instance</CardDescription>
            </div>
            <ServiceTestButton
              serviceName="Home Assistant"
              status={haTestStatus}
              errorMessage={haTestError}
              errorType={haTestErrorType}
              onTest={() => runHomeAssistantTest(true)}
              isConfigured={!!(settings?.homeAssistant?.baseUrl && settings?.homeAssistant?.accessToken)}
            />
          </div>
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

      {/* Plex Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Plex Media Server</CardTitle>
              <CardDescription>Connect Bernard to your Plex Media Server for voice-controlled media playback</CardDescription>
            </div>
            <ServiceTestButton
              serviceName="Plex"
              status={plexTestStatus}
              errorMessage={plexTestError}
              errorType={plexTestErrorType}
              onTest={() => runPlexTest(true)}
              isConfigured={!!(settings?.plex?.baseUrl && settings?.plex?.token)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plex-baseUrl">Server URL *</Label>
              <Input
                id="plex-baseUrl"
                type="url"
                value={settings?.plex?.baseUrl || ''}
                onChange={(e) => updatePlexSettings({ baseUrl: e.target.value })}
                placeholder="http://your-plex-server.local:32400"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plex-token">Access Token *</Label>
              <Input
                id="plex-token"
                type="password"
                value={settings?.plex?.token || ''}
                onChange={(e) => updatePlexSettings({ token: e.target.value })}
                placeholder="Your Plex token"
                required
              />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Get your Plex token from{' '}
              <a
                href="https://www.plex.tv/claim"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Plex.tv
              </a>
              {' '}or your Plex server settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* TTS Service Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>TTS Service</CardTitle>
              <CardDescription>Configure Text-to-Speech service for voice synthesis</CardDescription>
            </div>
            <ServiceTestButton
              serviceName="TTS"
              status={ttsTestStatus}
              errorMessage={ttsTestError}
              errorType={ttsTestErrorType}
              onTest={() => runTtsTest(true)}
              isConfigured={!!settings?.tts?.baseUrl}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tts-baseUrl">Base URL *</Label>
              <Input
                id="tts-baseUrl"
                type="url"
                value={settings?.tts?.baseUrl || ''}
                onChange={(e) => updateTtsSettings({ baseUrl: e.target.value })}
                placeholder="http://localhost:8880"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tts-apiKey">Access Token</Label>
              <Input
                id="tts-apiKey"
                type="password"
                value={settings?.tts?.apiKey || ''}
                onChange={(e) => updateTtsSettings({ apiKey: e.target.value })}
                placeholder="Optional access token"
              />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Configure a TTS endpoint. Supports Kokoro running locally or OpenAI-compatible API endpoints with access tokens.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* STT Service Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>STT Service</CardTitle>
              <CardDescription>Configure Speech-to-Text service for voice transcription</CardDescription>
            </div>
            <ServiceTestButton
              serviceName="STT"
              status={sttTestStatus}
              errorMessage={sttTestError}
              errorType={sttTestErrorType}
              onTest={() => runSttTest(true)}
              isConfigured={!!settings?.stt?.baseUrl}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stt-baseUrl">Base URL *</Label>
              <Input
                id="stt-baseUrl"
                type="url"
                value={settings?.stt?.baseUrl || ''}
                onChange={(e) => updateSttSettings({ baseUrl: e.target.value })}
                placeholder="http://localhost:8870"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stt-apiKey">Access Token</Label>
              <Input
                id="stt-apiKey"
                type="password"
                value={settings?.stt?.apiKey || ''}
                onChange={(e) => updateSttSettings({ apiKey: e.target.value })}
                placeholder="Optional access token"
              />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Configure an STT endpoint. Supports Whisper running locally or OpenAI-compatible API endpoints with access tokens.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Overseerr Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Overseerr</CardTitle>
              <CardDescription>Connect Bernard to Overseerr for media request management</CardDescription>
            </div>
            <ServiceTestButton
              serviceName="Overseerr"
              status={overseerrTestStatus}
              errorMessage={overseerrTestError}
              errorType={overseerrTestErrorType}
              onTest={() => runOverseerrTest(true)}
              isConfigured={!!(settings?.overseerr?.baseUrl && settings?.overseerr?.apiKey)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="overseerr-baseUrl">Server URL *</Label>
              <Input
                id="overseerr-baseUrl"
                type="url"
                value={settings?.overseerr?.baseUrl || ''}
                onChange={(e) => updateOverseerrSettings({ baseUrl: e.target.value })}
                placeholder="http://your-overseerr.local:5055/api/v1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="overseerr-apiKey">API Key *</Label>
              <Input
                id="overseerr-apiKey"
                type="password"
                value={settings?.overseerr?.apiKey || ''}
                onChange={(e) => updateOverseerrSettings({ apiKey: e.target.value })}
                placeholder="Your Overseerr API key"
                required
              />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Get your Overseerr API key from your Overseerr settings page under &quot;API Access&quot;.
              Settings configured here will override .env values.
            </p>
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

export default function ServicesPage() {
  return (
    <AdminLayout>
      <ServicesContent />
    </AdminLayout>
  );
}
