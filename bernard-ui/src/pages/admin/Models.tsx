import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import type { ProviderType, ModelsSettings, ModelInfo } from '../../services/adminApi';
import { useConfirmDialog, useAlertDialog } from '../../components/DialogManager';
import { useToast } from '../../components/ToastManager';

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

  // Hook calls - must be at the top level of the component function
  const confirm = useConfirmDialog();
  const alert = useAlertDialog();
  const toast = useToast();

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

  // Load models from localStorage on page load
  useEffect(() => {
    const savedModels = localStorage.getItem('providerModels');
    if (savedModels) {
      try {
        const parsedModels = JSON.parse(savedModels);
        setProviderModels(parsedModels);
      } catch (error) {
        console.error('Failed to parse saved models from localStorage:', error);
      }
    }
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
      alert({
        title: 'Missing Fields',
        description: 'Please fill in all provider fields',
        variant: 'warning'
      });
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
      alert({
        title: 'Failed to Create Provider',
        description: 'Failed to create provider',
        variant: 'error'
      });
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    const closeDialog = confirm({
      title: 'Delete Provider',
      description: 'Delete this provider? This will also remove it from any model configurations.',
      confirmVariant: 'destructive',
      onConfirm: async () => {
        try {
          await adminApiClient.deleteProvider(providerId);
          setProviders(providers.filter(p => p.id !== providerId));
          // Clear any selected models from this provider
          const updatedSettings = { ...settings! };
          categories.forEach(categoryObj => {
            const category = categoryObj.key;
            const categorySettings = updatedSettings[category as keyof Omit<ModelsSettings, 'providers'>];
            if (categorySettings && typeof categorySettings === 'object' && 'providerId' in categorySettings) {
              if (categorySettings.providerId === providerId) {
                updatedSettings[category as keyof Omit<ModelsSettings, 'providers'>] = { primary: '', providerId: '', options: {} };
              }
            }
          });
          setSettings(updatedSettings);
          toast.success('Provider deleted successfully');
        } catch (error) {
          console.error('Failed to delete provider:', error);
          toast.error('Failed to delete provider');
        }
      }
    });
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      const result = await adminApiClient.testProvider(providerId);
      if (result.status === 'working') {
        alert({
          title: 'Provider Test Successful',
          description: 'Provider test successful!',
          variant: 'success'
        });
        // Fetch models after successful test
        await loadProviderModels(providerId);
      } else {
        alert({
          title: 'Provider Test Failed',
          description: `Provider test failed: ${result.error || 'Unknown error'}`,
          variant: 'error'
        });
      }
    } catch (error) {
      console.error('Failed to test provider:', error);
      alert({
        title: 'Failed to Test Provider',
        description: 'Failed to test provider',
        variant: 'error'
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const loadProviderModels = async (providerId: string) => {
    try {
      const models = await adminApiClient.getProviderModels(providerId);
      const updatedModels = { ...providerModels, [providerId]: models };
      setProviderModels(updatedModels);
      // Save to localStorage
      localStorage.setItem('providerModels', JSON.stringify(updatedModels));
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const handleModelChange = (category: ModelCategory, modelId: string, providerId: string) => {
    setSelectedModels(prev => ({ ...prev, [category]: modelId }));
    
    setSettings(prev => {
      if (!prev) return prev;
      const newSettings = {
        ...prev,
        [category]: {
          ...(prev[category as keyof ModelsSettings] || {}),
          primary: modelId,
          providerId: providerId
        }
      };
      return newSettings;
    });
  };

  const handleProviderChange = (category: ModelCategory, providerId: string) => {
    // When provider changes, keep the existing model selection
    // Users should be able to select a provider and type any model name
    
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [category]: {
          ...(prev[category as keyof ModelsSettings] || {}),
          providerId: providerId
          // Don't clear the primary model - let users keep their custom model names
        }
      };
    });
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }
    
    setSaving(true);
    try {
      const updatedSettings = await adminApiClient.updateModelsSettings(settings);
      
      // Check if backend is returning different model names
      const categories: ModelCategory[] = ['response', 'intent', 'memory', 'utility', 'aggregation'];
      categories.forEach(category => {
        const frontendModel = settings[category]?.primary;
        const backendModel = updatedSettings[category]?.primary;
        if (frontendModel !== backendModel) {
        }
      });
      
      setSettings(updatedSettings);
      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to save settings: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const getModelsForProvider = (providerId: string) => {
    return providerModels[providerId] || [];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // ProviderSelector Component - Dropdown for provider selection
  const ProviderSelector = ({
    value,
    onChange,
    providers,
    disabled,
    placeholder = "Select a provider..."
  }: {
    value: string;
    onChange: (providerId: string) => void;
    providers: ProviderType[];
    disabled?: boolean;
    placeholder?: string;
  }) => {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{placeholder}</option>
        {providers.map(provider => (
          <option key={provider.id} value={provider.id}>
            {provider.name}
          </option>
        ))}
      </select>
    );
  };

  // ModelSelector Component - Searchable dropdown for model selection
  const ModelSelector = ({
    value,
    onChange,
    models,
    disabled,
    placeholder = "Select or type a model..."
  }: {
    value: string;
    onChange: (modelId: string) => void;
    models: ModelInfo[];
    disabled?: boolean;
    placeholder?: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [inputValue, setInputValue] = useState(value);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastEmittedValueRef = useRef(value);

    // Update input when value changes externally, but only if the dropdown is closed
    // This preserves user-typed values when the dropdown is open
    useEffect(() => {
      if (!isOpen && value !== inputValue) {
        setInputValue(value);
        lastEmittedValueRef.current = value;
      }
    }, [value]);

    // Close dropdown when clicking outside
    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
          setSelectedIndex(-1);
        }
      }

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredModels = models.filter(model =>
      model.id.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (modelId: string) => {
      // Only call onChange if the value has actually changed
      if (modelId !== lastEmittedValueRef.current) {
        onChange(modelId);
        lastEmittedValueRef.current = modelId;
      }
      setInputValue(modelId);
      setIsOpen(false);
      setSearch('');
      setSelectedIndex(-1);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      setSearch(newValue);
      setSelectedIndex(-1); // Reset selection when typing
      // Don't call onChange on every keystroke to avoid losing focus
      // The value will be propagated on blur or when selecting from dropdown
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const filteredModelsCount = filteredModels.length;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setSelectedIndex(0);
          } else {
            setSelectedIndex(prev =>
              prev < filteredModelsCount - 1 ? prev + 1 : 0
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setSelectedIndex(filteredModelsCount - 1);
          } else {
            setSelectedIndex(prev =>
              prev > 0 ? prev - 1 : filteredModelsCount - 1
            );
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (isOpen && selectedIndex >= 0 && selectedIndex < filteredModelsCount) {
            handleSelect(filteredModels[selectedIndex].id);
          } else if (isOpen && filteredModelsCount > 0) {
            // If no selection but dropdown is open, select the first item
            handleSelect(filteredModels[0].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    };

    return (
      <div ref={containerRef} className="relative">
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // When input loses focus, update the parent with the current input value
            // This ensures custom model names are preserved even if not in the dropdown
            if (inputValue !== lastEmittedValueRef.current) {
              onChange(inputValue);
              lastEmittedValueRef.current = inputValue;
            }
            setIsOpen(false);
            setSelectedIndex(-1);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-8"
        />
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredModels.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400">
                No models found
              </div>
            ) : (
              filteredModels.map((model, index) => (
                <button
                  key={model.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 cursor-pointer ${
                    index === selectedIndex
                      ? 'bg-blue-100 dark:bg-blue-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    handleSelect(model.id);
                  }}
                >
                  <div className="font-medium">{model.id}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Models Configuration</h1>
          <p className="text-gray-600 dark:text-gray-300">Configure AI providers and assign models</p>
        </div>
        <Button onClick={() => { handleSave(); }} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Providers Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Providers</CardTitle>
              <CardDescription>Manage AI service providers</CardDescription>
            </div>
            <Button onClick={() => setShowProviderForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Provider
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">API URL</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">API Key</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Number of Models</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(provider => {
                  const models = getModelsForProvider(provider.id);
                  
                  return (
                    <tr key={provider.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-4 px-4">
                        <div className="font-semibold">{provider.name}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm">{provider.baseUrl}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm text-gray-500 dark:text-gray-400">••••••••</div>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant={models.length > 0 ? "default" : "secondary"}>
                          {models.length > 0 ? `${models.length} models` : "not loaded"}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestProvider(provider.id)}
                            disabled={testingProvider === provider.id}
                            title="Test Provider"
                          >
                            <TestTube className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadProviderModels(provider.id)}
                            title="Load Models"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteProvider(provider.id)}
                            title="Delete Provider"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                
                {providers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                      No providers configured. Add your first provider to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Model Assignment Section */}
      <Card>
        <CardHeader>
          <CardTitle>Model Assignment</CardTitle>
          <CardDescription>Assign models to different harness categories. You can select from the dropdown or type any model name.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map(category => (
                <div key={category.key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg">{category.label}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{category.description}</p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor={`${category.key}-provider`}>Provider</Label>
                        <ProviderSelector
                          value={settings?.[category.key]?.providerId || ''}
                          onChange={(providerId) => handleProviderChange(category.key, providerId)}
                          providers={providers}
                          disabled={false}
                          placeholder="Select a provider..."
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`${category.key}-model`}>Model</Label>
                        <ModelSelector
                          value={settings?.[category.key]?.primary || ''}
                          onChange={(modelId) => handleModelChange(category.key, modelId, settings?.[category.key]?.providerId || '')}
                          models={getModelsForProvider(settings?.[category.key]?.providerId || '')}
                          disabled={getModelsForProvider(settings?.[category.key]?.providerId || '').length === 0}
                          placeholder="Select or type any model name..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

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