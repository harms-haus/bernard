'use client'

import { useState, useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  raw?: string
}

interface LogViewerProps {
  service?: string
  maxHeight?: string
  autoScroll?: boolean
}

export function LogViewer({ service = 'all', maxHeight = '400px', autoScroll = true }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const url = new URL('/api/logs/stream', window.location.origin)
    url.searchParams.set('service', service)

    const eventSource = new EventSource(url.toString())

    eventSource.onopen = () => {
      setConnected(true)
      setError(null)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const newEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: parseLogLevel(data.message || event.data),
          message: data.message || event.data,
        }

        setLogs((prev) => {
          const updated = [...prev, newEntry]
          if (updated.length > 1000) {
            return updated.slice(-1000)
          }
          return updated
        })
      } catch {
        const newEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: parseLogLevel(event.data),
          message: event.data,
        }

        setLogs((prev) => {
          const updated = [...prev, newEntry]
          if (updated.length > 1000) {
            return updated.slice(-1000)
          }
          return updated
        })
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
      setError('Connection lost, reconnecting...')
    }

    return () => {
      eventSource.close()
    }
  }, [service])

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const filteredLogs = filter
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(filter.toLowerCase()) ||
        log.level.toLowerCase().includes(filter.toLowerCase())
      )
    : logs

  const levelColors: Record<string, string> = {
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    debug: 'text-gray-500',
  }

  const levelBgColors: Record<string, string> = {
    info: 'bg-blue-900/30',
    warn: 'bg-yellow-900/30',
    error: 'bg-red-900/30',
    debug: 'bg-gray-900/30',
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-300">
            {service === 'all' ? 'All Logs' : `${service} Logs`}
          </span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={`text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setLogs([])}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-700 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div
        className="overflow-auto p-4 font-mono text-sm"
        style={{ maxHeight }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {connected ? 'Waiting for logs...' : 'No logs available'}
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={index}
              className={`px-2 py-0.5 rounded ${levelBgColors[log.level] || 'bg-gray-900/30'} hover:bg-gray-800/50`}
            >
              <span className="text-gray-500">[{formatTimestamp(log.timestamp)}]</span>{' '}
              <span className={`font-medium ${levelColors[log.level] || 'text-gray-300'}`}>
                {log.level.toUpperCase()}
              </span>{' '}
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

function parseLogLevel(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) return 'error'
  if (lower.includes('warn') || lower.includes('warning')) return 'warn'
  if (lower.includes('debug') || lower.includes('verbose')) return 'debug'
  return 'info'
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return timestamp
  }
}
