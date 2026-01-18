'use client';

import { useState, useEffect, useRef } from 'react';
import { useLogStream, LogEntry } from '@/hooks/useLogStream';

interface LogViewerProps {
  height?: string;
  showService?: boolean;
  filters?: {
    level?: string[];
    search?: string;
  };
  initialService?: string;
}

// Log level colors - adapt to theme
const levelColors: Record<string, string> = {
  info: 'text-blue-500 dark:text-blue-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  error: 'text-red-600 dark:text-red-400',
  debug: 'text-gray-500 dark:text-gray-400',
  trace: 'text-gray-400 dark:text-gray-500',
};

// Status indicator colors
const statusColors = {
  connected: 'bg-green-500 dark:bg-green-400',
  disconnected: 'bg-red-500 dark:bg-red-400',
};

// Available service tabs - ordered with All first, then Core, then individual services
const SERVICE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'redis', label: 'Redis' },
  { value: 'core', label: 'Core' },
  { value: 'bernard-agent', label: 'Agent' },
  { value: 'whisper', label: 'Whisper' },
  { value: 'kokoro', label: 'Kokoro' },
] as const;

export function LogViewer({
  height = '400px',
  showService = true,
  filters,
  initialService = 'all',
}: LogViewerProps) {
  const [activeService, setActiveService] = useState(initialService);
  const previousActiveServiceRef = useRef<string | null>(null);

  const { logs, isConnected, error, clearLogs, containerRef } = useLogStream({
    service: activeService,
    maxEntries: 500,
    autoScroll: true,
  });

  // Clear logs when switching services (but not on initial mount)
  useEffect(() => {
    if (previousActiveServiceRef.current !== null && previousActiveServiceRef.current !== activeService) {
      clearLogs();
    }
    previousActiveServiceRef.current = activeService;
  }, [activeService, clearLogs]);

  const filteredLogs = logs.filter((log) => {
    if (filters?.level?.length && !filters.level.includes(log.level)) {
      return false;
    }
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchLower) ||
        log.service.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
      {/* Header with tabs and status */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        {/* Service tabs - centered */}
        <div className="flex items-center gap-1">
          {SERVICE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveService(tab.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeService === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Status and actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? statusColors.connected : statusColors.disconnected
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredLogs.length} entries
          </span>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      <div
        ref={containerRef}
        className="overflow-auto font-mono text-sm bg-background/50"
        style={{ height, maxHeight: height }}
      >
        {filteredLogs.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No logs to display
          </div>
        ) : (
          <div className="px-2 space-y-0">
            {filteredLogs.map((log, index) => (
              <LogEntryRow
                key={`${log.timestamp}-${index}`}
                entry={log}
                showService={showService}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LogEntryRow({
  entry,
  showService,
}: {
  entry: LogEntry;
  showService: boolean;
}) {
  const level = (entry.level || 'info').toLowerCase();
  const colorClass = levelColors[level] || levelColors.info;

  return (
    <div className="flex gap-2 px-2 py-0 hover:bg-muted/30">
      <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
        {new Date(entry.timestamp).toLocaleTimeString()}
      </span>
      {showService && (
        <span className="text-purple-500 dark:text-purple-400 shrink-0 text-xs w-24 truncate">
          {entry.service}
        </span>
      )}
      <span
        className={`uppercase text-xs font-bold w-16 shrink-0 ${colorClass}`}
      >
        {level}
      </span>
      <span className="text-foreground break-all whitespace-pre-wrap">
        {entry.message}
      </span>
    </div>
  );
}
