'use client';

import { useState } from 'react';
import { LogViewer } from './LogViewer';
import { VALID_LOG_SERVICES } from '@/lib/services/config';

// Level filter button styles
const levelButtonStyles: Record<string, { bg: string; text: string; border: string; hover: string }> = {
  info: {
    bg: 'bg-blue-500/30 dark:bg-blue-500/30',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/50 dark:border-blue-500/50',
    hover: 'hover:bg-blue-500/40 dark:hover:bg-blue-500/40',
  },
  warn: {
    bg: 'bg-yellow-500/30 dark:bg-yellow-500/30',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/50 dark:border-yellow-500/50',
    hover: 'hover:bg-yellow-500/40 dark:hover:bg-yellow-500/40',
  },
  error: {
    bg: 'bg-red-500/30 dark:bg-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/50 dark:border-red-500/50',
    hover: 'hover:bg-red-500/40 dark:hover:bg-red-500/40',
  },
  debug: {
    bg: 'bg-gray-500/30 dark:bg-gray-500/30',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-500/50 dark:border-gray-500/50',
    hover: 'hover:bg-gray-500/40 dark:hover:bg-gray-500/40',
  },
};

export function CombinedLogs() {
  const [selectedService, setSelectedService] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const levels = ['info', 'warn', 'error', 'debug'];

  const toggleLevel = (level: string) => {
    setLevelFilter((prev) =>
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : [...prev, level]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Service:</label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Services</option>
            {VALID_LOG_SERVICES.map((service) => (
              <option key={service} value={service}>
                {service.charAt(0).toUpperCase() + service.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Level:</label>
          <div className="flex gap-1">
            {levels.map((level) => {
              const isActive = levelFilter.includes(level);
              const style = levelButtonStyles[level];
              return (
                <button
                  key={level}
                  onClick={() => toggleLevel(level)}
                  className={`px-2 py-1 text-xs uppercase rounded transition-colors border ${
                    isActive
                      ? `${style.bg} ${style.text} ${style.border}`
                      : `bg-secondary text-muted-foreground border-border hover:bg-secondary/80`
                  }`}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Search:</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter logs..."
            className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64"
          />
        </div>
      </div>

      <LogViewer
        height="calc(100vh - 250px)"
        showService={selectedService === 'all'}
        filters={{
          level: levelFilter.length > 0 ? levelFilter : undefined,
          search: searchTerm || undefined,
        }}
      />
    </div>
  );
}
