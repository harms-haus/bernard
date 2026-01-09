'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useServiceStatus, type ServiceStatus } from '@/hooks/useServiceStatus'
import { LogViewer } from '@/components/dashboard/LogViewer'

export default function StatusPage() {
  const router = useRouter()
  const { services, loading, error, refresh } = useServiceStatus({ interval: 2000 })
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  if (loading && services.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-white">Service Status</h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-4 animate-pulse">
                <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const healthyCount = services.filter((s: ServiceStatus) => 
    s.health === 'healthy' || s.status === 'running'
  ).length
  const totalCount = services.length

  const handleAction = async (serviceId: string, action: 'restart' | 'stop' | 'check') => {
    setActionLoading(`${serviceId}-${action}`)
    try {
      const response = await fetch(`/api/services/${serviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: action }),
      })
      const result = await response.json()
      if (!response.ok || (!result.success && result.error)) {
        alert(`${action.charAt(0).toUpperCase() + action.slice(1)} failed: ${result.error || result.message || 'Unknown error'}`)
      }
      refresh()
    } catch (err) {
      alert(`Error: ${err}`)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Service Status</h1>
            <p className="text-gray-400 mt-1">
              {healthyCount}/{totalCount} services healthy
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">Failed to load services: {error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {services.map((service: ServiceStatus) => (
            <div
              key={service.id}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700 hover:border-gray-600"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.action-buttons')) return
                router.push(`/services/${service.id}`)
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{service.name}</h3>
                  {service.port && (
                    <p className="text-gray-400 text-sm">Port {service.port}</p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  service.health === 'healthy' ? 'bg-green-900/50 text-green-400' :
                  service.health === 'unhealthy' ? 'bg-red-900/50 text-red-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {service.health.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm mb-3">
                <div className="flex gap-4 text-gray-400">
                  {service.uptime !== undefined && (
                    <span>Uptime: {formatDuration(service.uptime)}</span>
                  )}
                </div>
              </div>

              <div className="action-buttons flex items-center gap-2 pt-3 border-t border-gray-700">
                <button
                  onClick={() => handleAction(service.id, 'restart')}
                  disabled={actionLoading !== null}
                  className="flex-1 px-3 py-1.5 bg-yellow-900/40 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-yellow-200 hover:text-white text-xs rounded transition-colors"
                >
                  {actionLoading === `${service.id}-restart` ? '...' : 'Restart'}
                </button>
                <button
                  onClick={() => handleAction(service.id, 'stop')}
                  disabled={actionLoading !== null || service.health !== 'healthy'}
                  className="flex-1 px-3 py-1.5 bg-red-900/40 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-red-200 hover:text-white text-xs rounded transition-colors"
                >
                  {actionLoading === `${service.id}-stop` ? '...' : 'Stop'}
                </button>
                <button
                  onClick={() => handleAction(service.id, 'check')}
                  disabled={actionLoading !== null}
                  className="flex-1 px-3 py-1.5 bg-blue-900/40 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-blue-200 hover:text-white text-xs rounded transition-colors"
                >
                  {actionLoading === `${service.id}-check` ? '...' : 'Check'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Live Logs</h2>
          <LogViewer service="all" height="300px" />
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}
