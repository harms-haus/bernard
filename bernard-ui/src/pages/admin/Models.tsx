import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { 
  Plus, 
  Save, 
  Trash2, 
  TestTube, 
  CheckCircle, 
  XCircle,
  RefreshCw
} from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import type { ProviderType, ModelsSettings, ModelInfo } from '../../services/adminApi';

type ModelCategory = 'response' | 'intent' | 'memory' | 'utility' | 'aggregation';

interface ProviderForm {
  name: string;
  baseUrl: string;
  apiKey: string;
}

export default function Models() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderType[]>([]);
  const [settings, setSettings] = useState<ModelsSettings | null>(null);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderForm>({
    name: '',
    baseUrl: '',
    apiKey: ''
  });
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, ModelInfo[]>>({});
  const [selectedModels, setSelectedModels] = useState<Record<ModelCategory, string>>({
    response: '',
    intent: '',
    memory: '',
    utility: '',
    aggregation: ''
  });

  const categories: { key: ModelCategory; label: string; description: string }[] = [
    { key: 'response', label: 'Response', description: 'Final answer model used to reply.' },
    { key: 'intent', label: 'Intent', description: 'Routing and tool selection model.' },
    { key: 'memory', label: 'Memory', description: 'Utility model used for memory dedupe and search.' },
    { key: 'utility', label: 'Utility', description: 'Helper model for tools and misc tasks.' },
    { key: 'aggregation', label: 'Aggregation', description: 'Summaries and rollups.' }
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [settingsData, providersData] = await Promise.all([
        adminApiClient.getModelsSettings(),
        adminApiClient.listProviders()
      ]);
      setSettings(settingsData);
      setProviders(providersData);
      
      // Initialize selected models from settings
      const initialSelections: Record<ModelCategory, string> = {
        response: settingsData.response?.primary || '',
        intent: settingsData.intent?.primary || '',
        memory: settingsData.memory?.primary || '',
        utility: settingsData.utility?.primary || '',
        aggregation: settingsData.aggregation?.primary || ''
      };
      setSelectedModels(initialSelections);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerForm.name || !providerForm.baseUrl || !providerForm.apiKey) {
      alert('Please fill in all provider fields');
      return;
    }

    try {
      const newProvider = await adminApiClient.createProvider(providerForm);
      setProviders([...providers, newProvider]);
      setProviderForm({ name: '', baseUrl: '', apiKey: '' });
      setShowProviderForm(false);
      // Fetch models for the new provider
      await loadProviderModels(newProvider.id);
    } catch (error) {
      console.error('Failed to create provider:', error);
      alert('Failed to create provider');
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm('Delete this provider? This will also remove it from any model configurations.')) {
      return;
    }

    try {
      await adminApiClient.deleteProvider(providerId);
      setProviders(providers.filter(p => p.id !== providerId));
      // Clear any selected models from this provider
      const updatedSettings = { ...settings! };
      categories.forEach(category => {
        if (updatedSettings[category]?.providerId === providerId) {
          updatedSettings[category] = { primary: '', providerId: '', options: {} };
        }
      });
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to delete provider:', error);
      alert('Failed to delete provider');
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      const result = await adminApiClient.testProvider(providerId);
      if (result.status === 'working') {
        alert('Provider test successful!');
        // Fetch models after successful test
        await loadProviderModels(providerId);
      } else {
        alert(`Provider test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to test provider:', error);
      alert('Failed to test provider');
    } finally {
      setTestingProvider(null);
    }
  };

  const loadProviderModels = async (providerId: string) => {
    try {
      const models = await adminApiClient.getProviderModels(providerId);
      setProviderModels(prev => ({ ...prev, [providerId]: models }));
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const handleModelChange = (category: ModelCategory, modelId: string, providerId: string) => {
    setSelectedModels(prev => ({ ...prev, [category]: modelId }));
    
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [category]: {
          ...prev[category as keyof ModelsSettings],
          primary: modelId,
          providerId: providerId
        }
      };
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const updatedSettings = await adminApiClient.updateModelsSettings(settings);
      setSettings(updatedSettings);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getModelsForProvider = (providerId: string) => {
    return providerModels[providerId] || [];
  };

  const isProviderWorking = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    return provider?.testStatus === 'working';
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Models Configuration</h1>
          <p className="text-gray-600 dark:text-gray-300">Configure AI providers and assign models</p>
        </div>
        <Button onClick={() => setShowProviderForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {/* Providers Section */}
      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>Manage AI service providers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {providers.map(provider => (
              <div key={provider.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{provider.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{provider.baseUrl}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <Badge variant={isProviderWorking(provider.id) ? "default" : "secondary"}>
                        {isProviderWorking(provider.id) ? (
                          <>
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Working
                          </>
                        ) : (
                          <>
                            <XCircle className="mr-1 h-3 w-3" />
                            Not tested
                          </>
                        )}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestProvider(provider.id)}
                        disabled={testingProvider === provider.id}
                      >
                        <TestTube className="mr-2 h-4 w-4" />
                        {testingProvider === provider.id ? 'Testing...' : 'Test Provider'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadProviderModels(provider.id)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Load Models
                      </Button>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteProvider(provider.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Models list */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Available Models</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {getModelsForProvider(provider.id).map(model => (
                      <div key={model.id} className="flex items-center justify-between p-2 border border-gray-200 dark:border-gray-700 rounded">
                        <span className="text-sm">{model.id}</span>
                        <Badge variant="outline">{model.owned_by}</Badge>
                      </div>
                    ))}
                    {getModelsForProvider(provider.id).length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No models loaded. Click "Load Models" to fetch.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {providers.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400">No providers configured. Add your first provider to get started.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Model Assignment Section */}
      <Card>
        <CardHeader>
          <CardTitle>Model Assignment</CardTitle>
          <CardDescription>Assign models to different harness categories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {categories.map(category => (
              <div key={category.key} className="space-y-2">
                <div>
                  <h3 className="font-semibold">{category.label}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{category.description}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {providers.map(provider => (
                    <div key={provider.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{provider.name}</h4>
                        <Badge variant={isProviderWorking(provider.id) ? "default" : "secondary"}>
                          {isProviderWorking(provider.id) ? 'Ready' : 'Not tested'}
                        </Badge>
                      </div>
                      
                      <select
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        value={settings?.[category.key]?.primary || ''}
                        onChange={(e) => handleModelChange(category.key, e.target.value, provider.id)}
                        disabled={!isProviderWorking(provider.id)}
                      >
                        <option value="">Select a model...</option>
                        {getModelsForProvider(provider.id).map(model => (
                          <option key={model.id} value={model.id}>
                            {model.id}
                          </option>
                        ))}
                      </select>
                      
                      {settings?.[category.key]?.providerId === provider.id && settings[category.key]?.primary && (
                        <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Currently selected: {settings[category.key].primary}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Add Provider Form */}
      {showProviderForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add Provider</CardTitle>
            <CardDescription>Configure a new AI service provider</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProviderSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Provider Name</Label>
                  <Input
                    id="name"
                    value={providerForm.name}
                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    placeholder="e.g., OpenRouter, OpenAI"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseUrl">Base URL</Label>
                  <Input
                    id="baseUrl"
                    value={providerForm.baseUrl}
                    onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={providerForm.apiKey}
                  onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowProviderForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Provider
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}