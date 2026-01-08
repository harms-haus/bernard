'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  service?: string
  raw?: string
}

export interface UseLogStreamOptions {
  maxEntries?: number
  enabled?: boolean
  service?: string
}

export function useLogStream(options: UseLogStreamOptions = {}) {
  const { maxEntries = 1000, enabled = true, service = 'all' } = options
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const parseLogLine = useCallback((line: string): LogEntry => {
    const timestamp = new Date().toISOString()
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(line)
      return {
        timestamp: parsed.timestamp || timestamp,
        level: parsed.level || 'info',
        message: parsed.message || line,
        service: parsed.service,
        raw: line,
      }
    } catch {
      // Fallback to text parsing
      const level = line.toLowerCase().includes('error') ? 'error' 
        : line.toLowerCase().includes('warn') ? 'warn'
        : line.toLowerCase().includes('debug') ? 'debug'
        : 'info'
      
      return {
        timestamp,
        level,
        message: line,
        raw: line,
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setConnected(false)
      }
      return
    }

    const url = new URL('/api/logs/stream', window.location.origin)
    url.searchParams.set('service', service)

    const eventSource = new EventSource(url.toString())
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnected(true)
      setError(null)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const newEntry = parseLogLine(data)
        
        setLogs((prev) => {
          const updated = [...prev, newEntry]
          // Keep only the last maxEntries
          if (updated.length > maxEntries) {
            return updated.slice(-maxEntries)
          }
          return updated
        })
      } catch {
        // Handle raw line format
        const newEntry = parseLogLine(event.data)
        setLogs((prev) => {
          const updated = [...prev, newEntry]
          if (updated.length > maxEntries) {
            return updated.slice(-maxEntries)
          }
          return updated
        })
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
      setError('Connection lost, attempting to reconnect...')
      // EventSource will automatically reconnect
    }

    return () => {
      eventSource.close()
      eventSourceRef.current = null
      setConnected(false)
    }
  }, [enabled, service, maxEntries, parseLogLine])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
      setConnected(false)
    }
  }, [])

  return {
    logs,
    connected,
    error,
    clearLogs,
    disconnect,
  }
}
