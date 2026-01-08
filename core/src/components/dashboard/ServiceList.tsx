'use client'

import { useState, useEffect } from 'react'
import { ServiceCard } from './ServiceCard'

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

interface ServiceListProps {
  onServiceClick?: (serviceId: string) => void
}

export function ServiceList({ onServiceClick }: ServiceListProps) {
  const { statuses, loading, error, refresh } = useServiceStatus({ refreshInterval: 2000 })

  if (loading && statuses.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-4 animate-pulse">
            <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-8 text-center">
        <p className="text-red-400 mb-4">Failed to load services</p>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    )
  }

  const runningCount = statuses.filter((s) => s.status === 'running').length
  const totalCount = statuses.length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">Services</h2>
          <span className="text-sm text-gray-400">
            {runningCount}/{totalCount} running
          </span>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statuses.map((service) => (
          <ServiceCard
            key={service.id}
            serviceId={service.id}
            onNavigate={onServiceClick}
          />
        ))}
      </div>
    </div>
  )
}

function useServiceStatus(options: { refreshInterval?: number } = {}) {
  const { refreshInterval = 2000 } = options
  const [statuses, setStatuses] = useState<ServiceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatuses = async () => {
    try {
      const response = await fetch('/api/services')
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      setStatuses(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatuses()
    const interval = setInterval(fetchStatuses, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  return { statuses, loading, error, refresh: fetchStatuses }
}
