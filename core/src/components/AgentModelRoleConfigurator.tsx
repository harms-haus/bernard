"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProviderType, ModelInfo, AgentModelRoleSettings, UtilityModelSettings } from '@/services/adminApi';

interface AgentModelRoleConfiguratorProps {
  /** Agent ID (e.g., "bernard_agent") */
  agentId: string;
  /** Role ID (e.g., "main") */
  roleId: string;
  /** User-friendly role label */
  roleLabel: string;
  /** Role description */
  roleDescription: string;
  /** Current agent role settings */
  agentRoleSettings: AgentModelRoleSettings | undefined;
  /** Available providers */
  providers: ProviderType[];
  /** Cached models per provider */
  providerModels: Record<string, ModelInfo[]>;
  /** Callback when settings change */
  onUpdate: (agentId: string, roleId: string, primary: string, providerId: string) => void;
}

/**
 * Component for configuring a single model role within an agent.
 * Renders provider selector and model selector in a 3-column grid layout.
 */
export function AgentModelRoleConfigurator({
  agentId,
  roleId,
  roleLabel,
  roleDescription,
  agentRoleSettings,
  providers,
  providerModels,
  onUpdate,
}: AgentModelRoleConfiguratorProps) {
  const currentProviderId = agentRoleSettings?.providerId || '';
  const currentModel = agentRoleSettings?.primary || '';

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [inputValue, setInputValue] = useState(currentModel);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastEmittedValueRef = useRef(currentModel);

  const models = providerModels[currentProviderId] || [];

  // Update input when value changes externally
  useEffect(() => {
    if (!isOpen && currentModel !== inputValue) {
      setInputValue(currentModel);
      lastEmittedValueRef.current = currentModel;
    }
  }, [currentModel, isOpen, inputValue]);

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

  const handleProviderChange = (providerId: string) => {
    onUpdate(agentId, roleId, '', providerId);
  };

  const handleSelect = (modelId: string) => {
    if (modelId !== lastEmittedValueRef.current) {
      onUpdate(agentId, roleId, modelId, currentProviderId);
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
    setSelectedIndex(-1);
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

  const handleBlur = () => {
    if (inputValue !== lastEmittedValueRef.current) {
      onUpdate(agentId, roleId, inputValue, currentProviderId);
      lastEmittedValueRef.current = inputValue;
    }
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-medium text-sm">{roleLabel}</h4>
        <p className="text-xs text-muted-foreground">{roleDescription}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${agentId}-${roleId}-provider`} className="text-xs">
          Provider
        </Label>
        <select
          id={`${agentId}-${roleId}-provider`}
          value={currentProviderId}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:outline-none text-sm"
        >
          <option value="">Select a provider...</option>
          {providers.map(provider => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${agentId}-${roleId}-model`} className="text-xs">
          Model
        </Label>
        <div ref={containerRef} className="relative">
          <Input
            id={`${agentId}-${roleId}-model`}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsOpen(true)}
            onBlur={handleBlur}
            placeholder="Select or type any model name..."
            disabled={!currentProviderId}
            className="pr-8 text-sm"
          />
          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-auto">
              {filteredModels.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No models found
                </div>
              ) : (
                filteredModels.map((model, index) => (
                  <button
                    key={model.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 cursor-pointer ${index === selectedIndex
                        ? 'bg-primary/10'
                        : 'hover:bg-muted'
                      }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(model.id);
                    }}
                  >
                    <div className="font-medium text-sm">{model.id}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Utility Model Configurator Component
 * Similar to AgentModelRoleConfigurator but for the system-wide utility model.
 */
interface UtilityModelConfiguratorProps {
  /** Current utility model settings */
  settings: UtilityModelSettings | undefined;
  /** Available providers */
  providers: ProviderType[];
  /** Cached models per provider */
  providerModels: Record<string, ModelInfo[]>;
  /** Callback when settings change */
  onUpdate: (primary: string, providerId: string) => void;
}

export function UtilityModelConfigurator({
  settings,
  providers,
  providerModels,
  onUpdate,
}: UtilityModelConfiguratorProps) {
  const currentProviderId = settings?.providerId || '';
  const currentModel = settings?.primary || '';

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [inputValue, setInputValue] = useState(currentModel);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastEmittedValueRef = useRef(currentModel);

  const models = providerModels[currentProviderId] || [];

  useEffect(() => {
    if (!isOpen && currentModel !== inputValue) {
      setInputValue(currentModel);
      lastEmittedValueRef.current = currentModel;
    }
  }, [currentModel, isOpen, inputValue]);

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

  const handleProviderChange = (providerId: string) => {
    onUpdate('', providerId);
  };

  const handleSelect = (modelId: string) => {
    if (modelId !== lastEmittedValueRef.current) {
      onUpdate(modelId, currentProviderId);
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
    setSelectedIndex(-1);
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

  const handleBlur = () => {
    if (inputValue !== lastEmittedValueRef.current) {
      onUpdate(inputValue, currentProviderId);
      lastEmittedValueRef.current = inputValue;
    }
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-medium text-sm">Utility Model</h4>
        <p className="text-xs text-muted-foreground">
          Used for system tasks like auto-renaming and summarization
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="utility-provider" className="text-xs">
          Provider
        </Label>
        <select
          id="utility-provider"
          value={currentProviderId}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:outline-none text-sm"
        >
          <option value="">Select a provider...</option>
          {providers.map(provider => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="utility-model" className="text-xs">
          Model
        </Label>
        <div ref={containerRef} className="relative">
          <Input
            id="utility-model"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsOpen(true)}
            onBlur={handleBlur}
            placeholder="Select or type any model name..."
            disabled={!currentProviderId}
            className="pr-8 text-sm"
          />
          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-auto">
              {filteredModels.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No models found
                </div>
              ) : (
                filteredModels.map((model, index) => (
                  <button
                    key={model.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 cursor-pointer ${index === selectedIndex
                        ? 'bg-primary/10'
                        : 'hover:bg-muted'
                      }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(model.id);
                    }}
                  >
                    <div className="font-medium text-sm">{model.id}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
