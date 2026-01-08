'use client'

import { useState, useEffect } from 'react'

export interface ServiceStatus {
  id: string
  name: string
  port?: number
  status: 'running' | 'stopped' | 'starting' | 'failed'
  uptime?: number
  lastStarted?: Date
  lastStopped?: Date
  health: 'healthy' | 'unhealthy' | 'unknown'
  color: string
}

interface ServiceCardProps {
  serviceId: string
  onNavigate?: (serviceId: string) => void
}

export function ServiceCard({ serviceId, onNavigate }: ServiceCardProps) {
  const { status, loading, error, refresh } = useService(serviceId)

  if (loading && !status) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
      </div>
    )
  }

  if (error || !status) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-red-400 font-semibold">{serviceId}</h3>
            <p className="text-red-300 text-sm">Failed to load status</p>
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-sm rounded"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    starting: 'bg-yellow-500',
    failed: 'bg-red-500',
  }

  const healthColors: Record<string, string> = {
    healthy: 'text-green-400',
    unhealthy: 'text-red-400',
    unknown: 'text-gray-400',
  }

  return (
    <div 
      className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors cursor-pointer"
      onClick={() => onNavigate?.(serviceId)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div 
            className={`w-3 h-3 rounded-full ${statusColors[status.status] || 'bg-gray-500'} ${status.status === 'running' ? 'animate-pulse' : ''}`}
          />
          <div>
            <h3 className="text-white font-semibold">{status.name}</h3>
            {status.port && (
              <p className="text-gray-400 text-sm">Port {status.port}</p>
            )}
          </div>
        </div>
        <span className={`text-sm font-medium ${healthColors[status.health] || 'text-gray-400'}`}>
          {status.health.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-4 text-gray-400">
          {status.uptime !== undefined && (
            <span>Uptime: {formatDuration(status.uptime)}</span>
          )}
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          status.status === 'running' ? 'bg-green-900/50 text-green-400' :
          status.status === 'stopped' ? 'bg-gray-700 text-gray-400' :
          status.status === 'starting' ? 'bg-yellow-900/50 text-yellow-400' :
          'bg-red-900/50 text-red-400'
        }`}>
          {status.status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

function useService(id: string) {
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/services?service=${id}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [id])

  return { status, loading, error, refresh: fetchStatus }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}
