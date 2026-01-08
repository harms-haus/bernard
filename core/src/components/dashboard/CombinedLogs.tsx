'use client';

import { useState } from 'react';
import { LogViewer } from './LogViewer';
import { VALID_LOG_SERVICES } from '@/lib/services/config';

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
          <label className="text-sm text-gray-400">Service:</label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
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
          <label className="text-sm text-gray-400">Level:</label>
          <div className="flex gap-1">
            {levels.map((level) => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`px-2 py-1 text-xs uppercase rounded transition-colors ${
                  levelFilter.includes(level)
                    ? `bg-${level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'blue'}-500/30 text-${level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'blue'}-400 border border-${level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'blue'}-500/50`
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Search:</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter logs..."
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 w-64"
          />
        </div>
      </div>

      <LogViewer
        service={selectedService}
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
