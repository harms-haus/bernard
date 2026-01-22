"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Save,
  Trash2,
  TestTube,
  RefreshCw,
  MoreVertical,
  Edit
} from 'lucide-react';
import { adminApiClient } from '@/services/adminApi';
import type { ProviderType, ModelsSettings, ModelInfo, UtilityModelSettings, AgentModelSettings } from '@/services/adminApi';
import { useConfirmDialog, useAlertDialog } from '@/components/DialogManager';
import { useToast } from '@/components/ToastManager';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeaderConfig } from '@/components/dynamic-header/configs';
import { AGENT_MODEL_REGISTRY, listAgentDefinitions } from '@/lib/config/agentModelRegistry';
import { AgentModelRoleConfigurator, UtilityModelConfigurator } from '@/components/AgentModelRoleConfigurator';

interface ProviderForm {
  name: string;
  baseUrl: string;
  apiKey: string;
}

function ModelsContent() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderType[]>([]);
  const [settings, setSettings] = useState<ModelsSettings | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderType | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderForm>({
    name: '',
    baseUrl: '',
    apiKey: ''
  });
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [providerModels, setProviderModels] = useState<Record<string, ModelInfo[]>>({});

  const confirm = useConfirmDialog();
  const alert = useAlertDialog();
  const toast = useToast();

  // Get registered agents sorted alphabetically
  const registeredAgents = listAgentDefinitions();

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
      setProviders(Array.isArray(providersData) ? providersData : []);
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
      if (editingProvider) {
        const updates: Partial<ProviderType> = {
          name: providerForm.name,
          baseUrl: providerForm.baseUrl,
        };
        if (providerForm.apiKey && !providerForm.apiKey.startsWith('**********')) {
          updates.apiKey = providerForm.apiKey;
        }
        const updatedProvider = await adminApiClient.updateProvider(editingProvider.id, updates);
        setProviders(Array.isArray(providers) ? providers.map(p => p.id === updatedProvider.id ? updatedProvider : p) : [updatedProvider]);
        setSettings(prev => prev ? {
          ...prev,
          providers: prev.providers.map(p => p.id === updatedProvider.id ? updatedProvider : p)
        } : prev);
        toast.success('Provider updated successfully');
      } else {
        const newProvider = await adminApiClient.createProvider(providerForm);
        setProviders(Array.isArray(providers) ? [...providers, newProvider] : [newProvider]);
        setSettings(prev => prev ? {
          ...prev,
          providers: [...prev.providers, newProvider]
        } : prev);
        await loadProviderModels(newProvider.id);
        toast.success('Provider created successfully');
      }

      setDialogOpen(false);
      setEditingProvider(null);
      setProviderForm({ name: '', baseUrl: '', apiKey: '' });
    } catch (error) {
      console.error('Failed to save provider:', error);
      alert({
        title: `Failed to ${editingProvider ? 'Update' : 'Create'} Provider`,
        description: `Failed to ${editingProvider ? 'update' : 'create'} provider`,
        variant: 'error'
      });
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    confirm({
      title: 'Delete Provider',
      description: 'Delete this provider? This will also remove it from any model configurations.',
      confirmVariant: 'destructive',
      onConfirm: async () => {
        try {
          await adminApiClient.deleteProvider(providerId);
          setProviders(Array.isArray(providers) ? providers.filter(p => p.id !== providerId) : []);
          setSettings(prev => {
            if (!prev) return prev;
            const updatedSettings = { ...prev };
            // Update utility model if it was using this provider
            if (updatedSettings.utility?.providerId === providerId) {
              updatedSettings.utility = { ...updatedSettings.utility, primary: '', providerId: '' };
            }
            // Update agent roles if they were using this provider
            if (Array.isArray(updatedSettings.agents)) {
              updatedSettings.agents = updatedSettings.agents.map(agent => ({
                ...agent,
                roles: (agent.roles || []).map(role => 
                  role.providerId === providerId 
                    ? { ...role, primary: '', providerId: '' }
                    : role
                )
              }));
            }
            // Remove provider from list
            updatedSettings.providers = updatedSettings.providers.filter(p => p.id !== providerId);
            return updatedSettings;
          });
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
      setLoadingModels(prev => ({ ...prev, [providerId]: true }));
      const models = await adminApiClient.getProviderModels(providerId);
      const updatedModels = { ...providerModels, [providerId]: models };
      setProviderModels(updatedModels);
      localStorage.setItem('providerModels', JSON.stringify(updatedModels));

      if (models.length === 0) {
        toast.warning('No models found', 'The provider may not have any models available or the request failed.');
      } else {
        toast.success('Models loaded', `Successfully loaded ${models.length} models`);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error('Failed to load models', errorMessage);
    } finally {
      setLoadingModels(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const handleEditProvider = async (provider: ProviderType) => {
    try {
      const fullProvider = await adminApiClient.getProvider(provider.id);
      const maskedKey = fullProvider.apiKey ? `**********${fullProvider.apiKey.slice(-3)}` : '';
      setProviderForm({
        name: fullProvider.name,
        baseUrl: fullProvider.baseUrl,
        apiKey: maskedKey
      });
      setEditingProvider(fullProvider);
      setDialogOpen(true);
    } catch (error) {
      console.error('Failed to load provider for editing:', error);
      alert({
        title: 'Failed to Load Provider',
        description: 'Failed to load provider details for editing',
        variant: 'error'
      });
    }
  };

  const handleUtilityModelUpdate = (primary: string, providerId: string) => {
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        utility: {
          ...prev.utility,
          primary,
          providerId
        }
      };
    });
  };

  const handleAgentRoleUpdate = (agentId: string, roleId: string, primary: string, providerId: string) => {
    setSettings(prev => {
      if (!prev) return prev;
      if (!prev.agents) return prev;
      return {
        ...prev,
        agents: prev.agents.map(agent => {
          if (agent.agentId !== agentId) return agent;
          return {
            ...agent,
            roles: (agent.roles || []).map(role => {
              if (role.id !== roleId) return role;
              return {
                ...role,
                primary,
                providerId
              };
            })
          };
        })
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeaderConfig title="Admin Panel" subtitle="Models Configuration" />
      <div className="flex items-center justify-end">
        <Button onClick={handleSave} disabled={saving}>
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
            <Button onClick={() => {
              setEditingProvider(null);
              setProviderForm({ name: '', baseUrl: '', apiKey: '' });
              setDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Provider
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">API URL</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">API Key</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Number of Models</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(providers) && providers.map(provider => {
                  const models = getModelsForProvider(provider.id);

                  return (
                    <tr key={provider.id} className="border-b border-border">
                      <td className="py-4 px-4">
                        <div className="font-semibold">{provider.name}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm">{provider.baseUrl}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-sm text-muted-foreground">••••••••</div>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant={models.length > 0 ? "default" : "secondary"}>
                          {models.length > 0 ? `${models.length} models` : "not loaded"}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleTestProvider(provider.id)} disabled={testingProvider === provider.id}>
                              <TestTube className="mr-2 h-4 w-4" />
                              {testingProvider === provider.id ? 'Testing...' : 'Test Provider'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => loadProviderModels(provider.id)} disabled={loadingModels[provider.id]}>
                              <RefreshCw className={`mr-2 h-4 w-4 ${loadingModels[provider.id] ? 'animate-spin' : ''}`} />
                              {loadingModels[provider.id] ? 'Loading...' : 'Load Models'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditProvider(provider)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteProvider(provider.id)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}

                {providers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-muted-foreground">
                      No providers configured. Add your first provider to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Utility Model Section */}
      <Card>
        <CardHeader>
          <CardTitle>Utility Model</CardTitle>
          <CardDescription>System-wide model for background tasks like thread naming and summarization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UtilityModelConfigurator
              settings={settings?.utility}
              providers={Array.isArray(providers) ? providers : []}
              providerModels={providerModels}
              onUpdate={handleUtilityModelUpdate}
            />
          </div>
        </CardContent>
      </Card>

      {/* Agent Sections */}
      {registeredAgents.map(agent => {
        // Find the agent configuration in settings
        const agentConfig = (settings?.agents ?? []).find(a => a.agentId === agent.agentId);
        
        return (
          <Card key={agent.agentId}>
            <CardHeader>
              <CardTitle>{agent.name}</CardTitle>
              {agent.description && <CardDescription>{agent.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {agent.modelRoles.map(role => {
                  const roleSettings = (agentConfig?.roles ?? []).find(r => r.id === role.id);
                  return (
                    <AgentModelRoleConfigurator
                      key={`${agent.agentId}-${role.id}`}
                      agentId={agent.agentId}
                      roleId={role.id}
                      roleLabel={role.label}
                      roleDescription={role.description}
                      agentRoleSettings={roleSettings}
                      providers={Array.isArray(providers) ? providers : []}
                      providerModels={providerModels}
                      onUpdate={handleAgentRoleUpdate}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Provider Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditingProvider(null);
          setProviderForm({ name: '', baseUrl: '', apiKey: '' });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProvider ? 'Edit Provider' : 'Add Provider'}</DialogTitle>
            <DialogDescription>
              {editingProvider ? 'Update the AI service provider configuration' : 'Configure a new AI service provider'}
            </DialogDescription>
          </DialogHeader>
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
                value={providerForm.apiKey || ''}
                onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />
                {editingProvider ? 'Update Provider' : 'Add Provider'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ModelsPage() {
  return (
    <AdminLayout>
      <ModelsContent />
    </AdminLayout>
  );
}
