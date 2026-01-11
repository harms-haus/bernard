'use client';

import { useLogStream, LogEntry } from '@/hooks/useLogStream';

interface LogViewerProps {
  service: string;
  height?: string;
  showService?: boolean;
  filters?: {
    level?: string[];
    search?: string;
  };
}

const levelColors: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-400',
  trace: 'text-gray-500',
};

const levelBgColors: Record<string, string> = {
  info: 'bg-blue-400/10',
  warn: 'bg-yellow-400/10',
  error: 'bg-red-400/10',
  debug: 'bg-gray-400/10',
  trace: 'bg-gray-500/10',
};

export function LogViewer({
  service,
  height = '400px',
  showService = true,
  filters,
}: LogViewerProps) {
  const { logs, isConnected, error, clearLogs, containerRef } = useLogStream({
    service,
    maxEntries: 500,
    autoScroll: true,
  });

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
    <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-200">{service}</span>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{filteredLogs.length} entries</span>
          <button
            onClick={clearLogs}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      <div
        ref={containerRef}
        className="overflow-auto font-mono text-sm"
        style={{ height, maxHeight: height }}
      >
        {filteredLogs.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
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

function LogEntryRow({ entry, showService }: { entry: LogEntry; showService: boolean }) {
  const level = (entry.level || 'info').toLowerCase();
  const colorClass = levelColors[level] || levelColors.info;
  const bgClass = levelBgColors[level] || levelBgColors.info;

  return (
    <div className={`flex gap-2 px-2 py-0`}>
      <span className="text-gray-500 shrink-0 text-xs whitespace-nowrap">
        {new Date(entry.timestamp).toLocaleTimeString()}
      </span>
      {showService && (
        <span className="text-purple-400 shrink-0 text-xs w-24 truncate">
          {entry.service}
        </span>
      )}
      <span className={`uppercase text-xs font-bold w-16 shrink-0 ${colorClass}`}>
        {level}
      </span>
      <span className="text-gray-300 break-all whitespace-pre-wrap">
        {entry.message}
      </span>
    </div>
  );
}
